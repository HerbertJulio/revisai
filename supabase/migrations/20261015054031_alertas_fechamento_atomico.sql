-- Fechamento do alerta de preço sem corrida e com limites.
--
-- 1. O pedido com o preço combinado confere o preço que a oficina viu (a loja pode ter mudado a
--    proposta) e limita a quantidade ao que foi negociado.
-- 2. Depois de gravar o pedido, o próprio banco marca a resposta como escolhida e fecha o alerta, na
--    mesma transação: dois pedidos ao mesmo tempo para o mesmo alerta não passam os dois.
-- 3. Limite de alertas por WhatsApp, por aparelho e no total, e os de teste (sem código do Pro).
-- 4. Histórico das chaves Pix das lojas (para conferir se alguém trocou a chave).

create or replace function public.calcular_pedido()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_calculados jsonb := '[]'::jsonb;
  v_produto_id bigint;
  v_quantidade integer;
  v_nome text;
  v_preco numeric(10, 2);
  v_fornecedor_id bigint;
  v_fornecedor text;
  v_promocional numeric(10, 2);
  v_combinado numeric(10, 2);
  v_unitario numeric(10, 2);
  v_soma numeric(12, 2) := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for v_item in select value from jsonb_array_elements(new.itens)
  loop
    if jsonb_typeof(v_item -> 'produto_id') is distinct from 'number'
       or jsonb_typeof(v_item -> 'quantidade') is distinct from 'number' then
      raise exception 'Item de pedido inválido' using errcode = '22023';
    end if;
    v_produto_id := (v_item ->> 'produto_id')::bigint;
    v_quantidade := (v_item ->> 'quantidade')::integer;
    if v_quantidade < 1 or v_quantidade > 999 then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;

    select p.nome, p.preco, p.fornecedor_id, f.nome
      into v_nome, v_preco, v_fornecedor_id, v_fornecedor
      from public.produtos p
      join public.fornecedores f on f.id = p.fornecedor_id
     where p.id = v_produto_id and p.ativo and f.ativo;
    if not found then
      raise exception 'Produto % indisponível', v_produto_id using errcode = '22023';
    end if;

    select min(pr.preco_promocional) into v_promocional
      from public.promocoes pr
     where pr.produto_id = v_produto_id
       and pr.ativo
       and v_hoje between pr.inicio and pr.fim
       and v_quantidade >= pr.quantidade_minima;

    v_combinado := null;
    if jsonb_typeof(v_item -> 'resposta_id') = 'string' then
      select r.preco into v_combinado
        from public.alertas_respostas r
        join public.alertas_preco a on a.id = r.alerta_id
       where r.id = (v_item ->> 'resposta_id')::uuid
         and r.tipo in ('aceita', 'contraproposta')
         and r.produto_id = v_produto_id
         and r.fornecedor_id = v_fornecedor_id
         and r.status = 'enviada'
         and r.pedido_id is null
         and a.aparelho_id = new.aparelho_id
         and a.status = 'aberto'
         and a.expira_em > now() - interval '1 day'
         and v_quantidade >= coalesce(r.quantidade_minima, 1)
         -- o preço combinado vale para a quantidade negociada, com folga para trocar de embalagem
         and v_quantidade <= greatest(a.quantidade, coalesce(r.quantidade_minima, 1)) * 5;
      -- quem manda a resposta espera o preço combinado: sem ele, o pedido não sai
      if v_combinado is null then
        raise exception 'A proposta não vale mais' using errcode = 'RV001';
      end if;
      -- a loja mudou a proposta depois que a oficina viu: o pedido não sai com o preço novo
      if jsonb_typeof(v_item -> 'preco_esperado') = 'number' and v_combinado <> (v_item ->> 'preco_esperado')::numeric then
        raise exception 'A loja mudou a proposta' using errcode = 'RV002';
      end if;
    end if;

    v_unitario := least(v_preco, coalesce(v_promocional, v_preco), coalesce(v_combinado, v_preco));
    v_soma := v_soma + v_unitario * v_quantidade;
    v_calculados := v_calculados || jsonb_build_array(jsonb_build_object(
      'produto_id', v_produto_id,
      'nome', v_nome,
      'fornecedor_id', v_fornecedor_id,
      'fornecedor', v_fornecedor,
      'quantidade', v_quantidade,
      'preco_unitario', v_unitario,
      'promocao', coalesce(v_promocional < v_preco, false),
      'combinado', coalesce(v_combinado is not null and v_combinado <= least(v_preco, coalesce(v_promocional, v_preco)), false)
    ) || case when v_combinado is not null then jsonb_build_object('resposta_id', v_item ->> 'resposta_id') else '{}'::jsonb end);
  end loop;

  new.itens := v_calculados;
  new.total := v_soma;
  new.status := 'novo';
  new.criado_em := now();
  return new;
end;
$$;

revoke all on function public.calcular_pedido() from public, anon, authenticated;

-- 2. Fecha o alerta junto com o pedido. Primeiro trava o alerta (todos os pedidos do mesmo alerta
-- esperam na mesma fila), depois a resposta, e descarta as outras.
create or replace function public.fechar_alerta_do_pedido()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_resposta uuid;
  v_alerta uuid;
begin
  for v_item in select value from jsonb_array_elements(new.itens)
  loop
    if jsonb_typeof(v_item -> 'resposta_id') is distinct from 'string' then
      continue;
    end if;
    v_resposta := (v_item ->> 'resposta_id')::uuid;
    select r.alerta_id into v_alerta from public.alertas_respostas r where r.id = v_resposta;
    if v_alerta is null then
      raise exception 'A proposta não vale mais' using errcode = 'RV001';
    end if;
    update public.alertas_preco
       set status = 'fechado', resposta_escolhida = v_resposta, atualizado_em = now()
     where id = v_alerta and status = 'aberto';
    if not found then
      raise exception 'O alerta já foi fechado' using errcode = 'RV001';
    end if;
    update public.alertas_respostas
       set status = 'escolhida', pedido_id = new.id
     where id = v_resposta and status = 'enviada' and pedido_id is null;
    if not found then
      raise exception 'A proposta não vale mais' using errcode = 'RV001';
    end if;
    update public.alertas_respostas
       set status = 'descartada'
     where alerta_id = v_alerta and status = 'enviada' and id <> v_resposta;
  end loop;
  return null;
end;
$$;

revoke all on function public.fechar_alerta_do_pedido() from public, anon, authenticated;

create trigger pedidos_fechar_alerta
after insert on public.pedidos
for each row execute function public.fechar_alerta_do_pedido();

-- 3. Limites dos alertas (o servidor também confere a cota; aqui é a trava final).
create or replace function public.limitar_alertas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_whatsapp integer;
  v_aparelho integer;
  v_geral integer;
  v_teste integer;
begin
  select count(*) into v_whatsapp from public.alertas_preco
   where oficina_whatsapp = new.oficina_whatsapp and criado_em > now() - interval '1 day';
  select count(*) into v_aparelho from public.alertas_preco
   where aparelho_id = new.aparelho_id and criado_em > now() - interval '1 day';
  select count(*) into v_geral from public.alertas_preco where criado_em > now() - interval '1 minute';
  if v_whatsapp >= 20 or v_aparelho >= 20 or v_geral >= 60 then
    raise exception 'Muitos alertas seguidos' using errcode = 'P0001';
  end if;
  if new.codigo_pro is null then
    select count(*) into v_teste from public.alertas_preco
     where codigo_pro is null
       and (aparelho_id = new.aparelho_id or oficina_whatsapp = new.oficina_whatsapp)
       and criado_em > now() - interval '30 days';
    if v_teste >= 6 then
      raise exception 'Alertas de teste esgotados' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.limitar_alertas() from public, anon, authenticated;

create trigger alertas_limitar
before insert on public.alertas_preco
for each row execute function public.limitar_alertas();

-- 4. Histórico das chaves Pix: cada troca guarda a chave anterior.
create table public.fornecedores_pix_historico (
  id bigint generated always as identity primary key,
  fornecedor_id bigint not null references public.fornecedores (id),
  tipo text not null,
  chave text not null,
  nome text not null,
  cidade text not null,
  usada_ate timestamptz not null default now()
);

comment on table public.fornecedores_pix_historico is 'Chaves Pix que as lojas já usaram, para conferir trocas.';

create index fornecedores_pix_historico_fornecedor_idx on public.fornecedores_pix_historico (fornecedor_id, usada_ate);

alter table public.fornecedores_pix_historico enable row level security;
grant select on public.fornecedores_pix_historico to anon;
create policy "Equipe vê o histórico do Pix" on public.fornecedores_pix_historico for select to anon using ((select privado.equipe_autorizada()));

create or replace function public.guardar_pix_antigo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.tipo is distinct from new.tipo or old.chave is distinct from new.chave or old.nome is distinct from new.nome or old.cidade is distinct from new.cidade then
    insert into public.fornecedores_pix_historico (fornecedor_id, tipo, chave, nome, cidade)
    values (old.fornecedor_id, old.tipo, old.chave, old.nome, old.cidade);
  end if;
  return new;
end;
$$;

revoke all on function public.guardar_pix_antigo() from public, anon, authenticated;

create trigger fornecedores_pix_historico
after update on public.fornecedores_pix
for each row execute function public.guardar_pix_antigo();

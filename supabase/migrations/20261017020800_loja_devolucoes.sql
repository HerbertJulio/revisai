-- Garantia e devolução: depois da entrega, a oficina pede a devolução (peça errada, com defeito, que
-- não serviu) ou a garantia de uma compra numa loja, com o motivo, os itens e até 6 fotos. A loja
-- responde: pede mais informação (a oficina ainda pode mudar o pedido), aceita ou recusa, e marca
-- como resolvida quando a troca ou o reembolso acontece (a oficina também pode confirmar). Os dois
-- lados veem; a equipe (suporte) acompanha e pode intervir em qualquer ponto.
-- As fotos ficam no bucket 'links', na pasta da oficina (ela grava ali; o bucket é de leitura pública,
-- com nomes que não se adivinham).

create table if not exists public.devolucoes (
  id uuid primary key default gen_random_uuid(),
  parte_id bigint not null references public.pedidos_fornecedores (id) on delete cascade,
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  fornecedor_id bigint not null references public.fornecedores (id) on delete cascade,
  -- o código do pedido, copiado da parte, para os dois lados reconhecerem a compra
  codigo text,
  tipo text not null default 'devolucao' check (tipo in ('devolucao', 'garantia')),
  motivo text not null check (char_length(motivo) between 5 and 1000),
  -- [{produto_id, nome, quantidade, preco_unitario}] dos itens da compra; vazio = a compra toda
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 50),
  -- caminhos no bucket 'links' ("<oficina>/devolucoes/<nome>")
  fotos jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 6),
  situacao text not null default 'aberta' check (situacao in ('aberta', 'aceita', 'recusada', 'resolvida')),
  resposta text check (char_length(resposta) <= 1000),
  aberta_por uuid references auth.users (id) on delete set null,
  respondida_por uuid references auth.users (id) on delete set null,
  respondida_em timestamptz,
  resolvida_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.devolucoes is 'Pedidos de devolução ou garantia de uma compra (parte do pedido) e a resposta da loja.';

create index if not exists devolucoes_loja_idx on public.devolucoes (fornecedor_id, situacao, criado_em desc);
create index if not exists devolucoes_oficina_idx on public.devolucoes (oficina_id, criado_em desc);
create index if not exists devolucoes_parte_idx on public.devolucoes (parte_id);
-- uma devolução em andamento por compra
create unique index if not exists devolucoes_uma_em_andamento on public.devolucoes (parte_id) where situacao in ('aberta', 'aceita');

alter table public.devolucoes enable row level security;
revoke all on public.devolucoes from anon, authenticated;
grant select, insert, update, delete on public.devolucoes to authenticated;

drop policy if exists "Oficina e loja veem as devoluções" on public.devolucoes;
drop policy if exists "Oficina pede devolução das próprias compras" on public.devolucoes;
drop policy if exists "Oficina e loja mexem na devolução" on public.devolucoes;
drop policy if exists "Oficina desiste enquanto está aberta" on public.devolucoes;
drop policy if exists "Equipe cuida das devoluções" on public.devolucoes;
create policy "Oficina e loja veem as devoluções" on public.devolucoes for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()));
create policy "Oficina pede devolução das próprias compras" on public.devolucoes for insert to authenticated
  with check (oficina_id in (select privado.minhas_oficinas()));
create policy "Oficina e loja mexem na devolução" on public.devolucoes for update to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or fornecedor_id in (select privado.meus_fornecedores()))
  with check (oficina_id in (select privado.minhas_oficinas()) or fornecedor_id in (select privado.meus_fornecedores()));
create policy "Oficina desiste enquanto está aberta" on public.devolucoes for delete to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) and situacao = 'aberta');
create policy "Equipe cuida das devoluções" on public.devolucoes for all to authenticated
  using ((select privado.eh_equipe(array['suporte']))) with check ((select privado.eh_equipe(array['suporte'])));

-- ------------------------------------------------------------------ regras

/**
 * Quem pode o quê na devolução. Ao abrir: a parte precisa ser da oficina, estar entregue há no máximo
 * 90 dias e ter no máximo 3 pedidos; a loja, a oficina e o código vêm da parte, e os itens são
 * conferidos com a compra. Depois: a oficina muda o que escreveu enquanto está aberta e confirma a
 * resolução; a loja responde (aberta → aceita ou recusada, recusada → aceita, aceita → resolvida, ou só
 * a resposta); resolvida é o fim. A equipe (suporte) pode tudo.
 */
create or replace function privado.regras_da_devolucao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parte record;
  v_equipe boolean := privado.eh_equipe(array['suporte']) or privado.sistema_autorizado();
  v_da_oficina boolean;
  v_da_loja boolean;
  v_foto jsonb;
  v_caminho text;
  v_item jsonb;
  v_comprado jsonb;
  v_produto bigint;
  v_quantidade numeric;
  v_itens jsonb := '[]'::jsonb;
begin
  select pf.id, pf.oficina_id, pf.fornecedor_id, pf.codigo, pf.status, pf.itens, coalesce(pf.entregue_em, pf.atualizado_em) as entregue_em
    into v_parte
    from public.pedidos_fornecedores pf
   where pf.id = new.parte_id;
  if not found or v_parte.oficina_id is null then
    raise exception 'Compra não encontrada' using errcode = 'P0002';
  end if;

  if tg_op = 'INSERT' then
    new.oficina_id := v_parte.oficina_id;
    new.fornecedor_id := v_parte.fornecedor_id;
    new.codigo := v_parte.codigo;
    -- compra de outra oficina: a mesma resposta de compra que não existe
    if not v_equipe and new.oficina_id not in (select privado.minhas_oficinas()) then
      raise exception 'Compra não encontrada' using errcode = 'P0002';
    end if;
    if v_parte.status <> 'entregue' then
      raise exception 'A devolução só pode ser pedida depois que a compra for entregue' using errcode = 'P0001';
    end if;
    if not v_equipe and v_parte.entregue_em < now() - interval '90 days' then
      raise exception 'O prazo para pedir devolução ou garantia pelo Revisaí é de 90 dias depois da entrega' using errcode = 'P0001';
    end if;
    if (select count(*) from public.devolucoes d where d.parte_id = new.parte_id) >= 3 then
      raise exception 'Esta compra já teve 3 pedidos de devolução. Fale com o suporte do Revisaí' using errcode = 'P0001';
    end if;
    if (select count(*) from public.devolucoes d where d.oficina_id = new.oficina_id and d.criado_em > now() - interval '1 day') >= 30 then
      raise exception 'Muitos pedidos de devolução seguidos. Tente de novo amanhã' using errcode = 'P0001';
    end if;
    new.situacao := 'aberta';
    new.resposta := null;
    new.aberta_por := auth.uid();
    new.respondida_por := null;
    new.respondida_em := null;
    new.resolvida_em := null;
    new.criado_em := now();
  else
    if new.id <> old.id or new.parte_id <> old.parte_id or new.oficina_id <> old.oficina_id or new.fornecedor_id <> old.fornecedor_id
       or new.codigo is distinct from old.codigo or new.criado_em <> old.criado_em or new.aberta_por is distinct from old.aberta_por then
      raise exception 'A devolução não muda de compra' using errcode = '42501';
    end if;
    v_da_oficina := old.oficina_id in (select privado.minhas_oficinas());
    v_da_loja := old.fornecedor_id in (select privado.meus_fornecedores());
    if not v_equipe then
      if old.situacao = 'resolvida' then
        raise exception 'Esta devolução já foi resolvida' using errcode = 'P0001';
      end if;
      -- o que a oficina escreveu: só ela muda, e só enquanto está aberta
      if (new.tipo, new.motivo, new.itens, new.fotos) is distinct from (old.tipo, old.motivo, old.itens, old.fotos) then
        if not v_da_oficina then
          raise exception 'Só a oficina muda o pedido de devolução' using errcode = '42501';
        elsif old.situacao <> 'aberta' then
          raise exception 'O pedido de devolução só muda enquanto está aberto' using errcode = 'P0001';
        end if;
      end if;
      -- a resposta: só a loja
      if new.resposta is distinct from old.resposta and not v_da_loja then
        raise exception 'Só a loja responde a devolução' using errcode = '42501';
      end if;
      if new.situacao <> old.situacao and not (
           (v_da_loja and (old.situacao, new.situacao) in (('aberta', 'aceita'), ('aberta', 'recusada'), ('recusada', 'aceita'), ('aceita', 'resolvida')))
        or (v_da_oficina and old.situacao = 'aceita' and new.situacao = 'resolvida')
      ) then
        raise exception 'Essa mudança de situação não vale para a devolução' using errcode = 'P0001';
      end if;
    end if;
    -- respondeu (situação da loja ou resposta nova): quem e quando
    if new.resposta is distinct from old.resposta or (new.situacao <> old.situacao and new.situacao in ('aceita', 'recusada')) then
      new.respondida_por := auth.uid();
      new.respondida_em := now();
    else
      new.respondida_por := old.respondida_por;
      new.respondida_em := old.respondida_em;
    end if;
    new.resolvida_em := case
      when new.situacao <> 'resolvida' then null
      when old.situacao = 'resolvida' then old.resolvida_em
      else now()
    end;
  end if;

  new.motivo := btrim(new.motivo);
  new.resposta := nullif(btrim(new.resposta), '');
  if new.situacao = 'recusada' and (tg_op = 'INSERT' or old.situacao <> 'recusada') and char_length(coalesce(new.resposta, '')) < 5 then
    raise exception 'Diga à oficina por que a devolução foi recusada' using errcode = 'P0001';
  end if;

  -- fotos: só da pasta da oficina, no máximo 6
  if tg_op = 'INSERT' or new.fotos is distinct from old.fotos then
    for v_foto in select x from jsonb_array_elements(new.fotos) as t (x) loop
      v_caminho := case when jsonb_typeof(v_foto) = 'string' then v_foto #>> '{}' end;
      if v_caminho is null or v_caminho !~ ('^' || new.oficina_id::text || '/devolucoes/[A-Za-z0-9._-]{1,120}$') or position('..' in v_caminho) > 0 then
        raise exception 'Foto inválida no pedido de devolução' using errcode = '22023';
      end if;
    end loop;
  end if;

  -- itens: conferidos com a compra (nome e preço vêm dela); a quantidade não passa do que foi comprado
  if tg_op = 'INSERT' or new.itens is distinct from old.itens then
    for v_item in select x from jsonb_array_elements(new.itens) as t (x) loop
      begin
        v_produto := (v_item ->> 'produto_id')::bigint;
        v_quantidade := (v_item ->> 'quantidade')::numeric;
      exception when others then
        raise exception 'Item inválido no pedido de devolução' using errcode = '22023';
      end;
      select c into v_comprado
        from jsonb_array_elements(case when jsonb_typeof(v_parte.itens) = 'array' then v_parte.itens else '[]'::jsonb end) as t (c)
       where (c ->> 'produto_id')::bigint = v_produto
         and coalesce((c ->> 'fornecedor_id')::bigint, v_parte.fornecedor_id) = v_parte.fornecedor_id
       limit 1;
      if v_comprado is null or v_quantidade is null or v_quantidade <= 0 or v_quantidade > (v_comprado ->> 'quantidade')::numeric
         or v_itens @> jsonb_build_array(jsonb_build_object('produto_id', v_produto)) then
        raise exception 'Os itens da devolução não conferem com a compra' using errcode = '22023';
      end if;
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'produto_id', v_produto,
        'nome', v_comprado ->> 'nome',
        'quantidade', v_quantidade,
        'preco_unitario', (v_comprado ->> 'preco_unitario')::numeric
      ));
    end loop;
    new.itens := v_itens;
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

revoke all on function privado.regras_da_devolucao() from public, anon, authenticated;

drop trigger if exists devolucoes_regras on public.devolucoes;
create trigger devolucoes_regras before insert or update on public.devolucoes
  for each row execute function privado.regras_da_devolucao();

-- tempo real: a loja vê o pedido chegar; a oficina, a resposta
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'devolucoes') then
    alter publication supabase_realtime add table public.devolucoes;
  end if;
end $$;

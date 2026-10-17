-- Moderação dos produtos e das lojas: a oficina denuncia (produto falsificado, preço enganoso, loja
-- que não entregou, conteúdo impróprio), a equipe de suporte vê a fila e decide. O produto que três
-- oficinas diferentes (de pessoas diferentes) denunciaram sai da vitrine sozinho até a equipe olhar:
-- produtos.oculto_moderacao some da política do catálogo, então some da loja das oficinas, do
-- pedido (o cálculo do pedido lê os produtos como a oficina) e das respostas aos alertas.

-- ------------------------------------------------------------------ produto escondido

alter table public.produtos
  add column if not exists oculto_moderacao boolean not null default false;

comment on column public.produtos.oculto_moderacao is 'Fora da vitrine pela moderação (denúncias de 3 oficinas ou decisão da equipe). Só a equipe muda.';

create index if not exists produtos_oculto_moderacao_idx on public.produtos (fornecedor_id) where oculto_moderacao;

-- a vitrine não mostra o produto escondido; a loja dona, a equipe e o sistema continuam vendo
alter policy "Catálogo: produtos ativos" on public.produtos
  using (
    (ativo and not oculto_moderacao and exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.ativo))
    or fornecedor_id in (select privado.meus_fornecedores())
    or (select privado.eh_equipe())
    or (select privado.sistema_autorizado())
  );

/** Só a equipe de suporte (ou uma função do banco) esconde ou mostra um produto. */
create or replace function privado.loja2_proteger_moderacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not privado.veio_da_api() or coalesce(privado.eh_equipe(array['suporte']), false) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.oculto_moderacao := false;
  elsif new.oculto_moderacao is distinct from old.oculto_moderacao then
    raise exception 'Só a equipe do Revisaí tira o produto da moderação' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function privado.loja2_proteger_moderacao() from public, anon, authenticated;

drop trigger if exists produtos_moderacao on public.produtos;
create trigger produtos_moderacao before insert or update on public.produtos
  for each row execute function privado.loja2_proteger_moderacao();

/** A loja não oferece num alerta de preço um produto que está fora da vitrine. */
create or replace function privado.loja2_resposta_sem_oculto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.produto_id is not null and exists (select 1 from public.produtos p where p.id = new.produto_id and p.oculto_moderacao) then
    raise exception 'Este produto está fora da vitrine pela moderação' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function privado.loja2_resposta_sem_oculto() from public, anon, authenticated;

drop trigger if exists alertas_respostas_moderacao on public.alertas_respostas;
create trigger alertas_respostas_moderacao before insert or update of produto_id on public.alertas_respostas
  for each row execute function privado.loja2_resposta_sem_oculto();

-- ------------------------------------------------------------------ denúncias

create table if not exists public.denuncias (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  fornecedor_id bigint not null references public.fornecedores (id) on delete cascade,
  -- vazio = a denúncia é da loja (não entregou, por exemplo)
  produto_id bigint references public.produtos (id) on delete set null,
  motivo text not null check (motivo in ('falsificado', 'preco_enganoso', 'nao_entregou', 'conteudo_improprio', 'outro')),
  texto text check (char_length(texto) <= 1000),
  situacao text not null default 'nova' check (situacao in ('nova', 'em_analise', 'resolvida', 'descartada')),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  resolvido_por uuid references auth.users (id) on delete set null,
  resolvido_em timestamptz,
  resolucao text check (char_length(resolucao) <= 500)
);

comment on table public.denuncias is 'Denúncias das oficinas sobre produtos e lojas. A equipe de suporte vê e decide; a oficina vê as dela; a loja não vê quem denunciou.';

-- uma denúncia aberta por oficina em cada produto (e em cada loja, quando é da loja)
create unique index if not exists denuncias_uma_aberta_por_produto on public.denuncias (oficina_id, produto_id)
  where produto_id is not null and situacao in ('nova', 'em_analise');
create unique index if not exists denuncias_uma_aberta_por_loja on public.denuncias (oficina_id, fornecedor_id)
  where produto_id is null and situacao in ('nova', 'em_analise');
create index if not exists denuncias_fila_idx on public.denuncias (situacao, criado_em desc);
create index if not exists denuncias_produto_idx on public.denuncias (produto_id) where produto_id is not null;
create index if not exists denuncias_loja_idx on public.denuncias (fornecedor_id, criado_em desc);
create index if not exists denuncias_oficina_idx on public.denuncias (oficina_id, criado_em desc);

alter table public.denuncias enable row level security;
revoke all on public.denuncias from anon, authenticated;
grant select on public.denuncias to authenticated;

drop policy if exists "Equipe e a oficina que denunciou veem a denúncia" on public.denuncias;
create policy "Equipe e a oficina que denunciou veem a denúncia" on public.denuncias for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe(array['suporte'])));

-- o que a equipe decide fica no histórico da equipe
drop trigger if exists auditar on public.denuncias;
create trigger auditar after update or delete on public.denuncias for each row execute function privado.auditar();

/**
 * A oficina denuncia um produto (p_produto) ou uma loja (p_produto vazio e p_fornecedor). Até 10
 * por dia por oficina e uma aberta por produto (ou loja) por oficina (RV064). A loja só pode ser
 * denunciada por quem comprou dela (RV065). Com denúncias abertas de 3 oficinas e 3 pessoas
 * diferentes, o produto sai da vitrine até a equipe decidir.
 */
create or replace function public.denunciar(p_oficina uuid, p_produto bigint, p_fornecedor bigint, p_motivo text, p_texto text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_loja bigint;
  v_id uuid;
  v_quantas integer;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  if p_oficina is null or privado.papel_na_oficina(p_oficina) is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if not exists (select 1 from public.oficinas o where o.id = p_oficina and o.ativa) then
    raise exception 'Esta oficina está desativada' using errcode = '42501';
  end if;
  if coalesce(p_motivo, '') not in ('falsificado', 'preco_enganoso', 'nao_entregou', 'conteudo_improprio', 'outro') then
    raise exception 'Escolha o motivo da denúncia' using errcode = '22023';
  end if;
  if p_produto is not null then
    select p.fornecedor_id into v_loja from public.produtos p where p.id = p_produto;
    if v_loja is null or (p_fornecedor is not null and p_fornecedor <> v_loja) then
      raise exception 'Produto não encontrado' using errcode = '22023';
    end if;
  else
    v_loja := p_fornecedor;
    if v_loja is null or not exists (select 1 from public.fornecedores f where f.id = v_loja) then
      raise exception 'Loja não encontrada' using errcode = '22023';
    end if;
    if not exists (select 1 from public.pedidos_fornecedores pf where pf.fornecedor_id = v_loja and pf.oficina_id = p_oficina) then
      raise exception 'Só dá para denunciar a loja depois de comprar dela. Para um produto, denuncie o produto' using errcode = 'RV065';
    end if;
  end if;
  if (select count(*) from public.denuncias d where d.oficina_id = p_oficina and d.criado_em > now() - interval '1 day') >= 10 then
    raise exception 'Muitas denúncias seguidas. Tente amanhã ou fale com a equipe do Revisaí' using errcode = 'P0001';
  end if;
  begin
    insert into public.denuncias (oficina_id, fornecedor_id, produto_id, motivo, texto, criado_por)
    values (p_oficina, v_loja, p_produto, p_motivo, nullif(left(trim(coalesce(p_texto, '')), 1000), ''), v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esta oficina já denunciou %. A equipe do Revisaí está olhando', case when p_produto is null then 'esta loja' else 'este produto' end
      using errcode = 'RV064';
  end;
  if p_produto is not null then
    select least(count(distinct d.oficina_id), count(distinct d.criado_por)) into v_quantas
      from public.denuncias d
     where d.produto_id = p_produto and d.situacao in ('nova', 'em_analise');
    if v_quantas >= 3 then
      update public.produtos set oculto_moderacao = true where id = p_produto and not oculto_moderacao;
    end if;
  end if;
  return v_id;
end;
$$;

/**
 * O que a equipe de suporte decide numa denúncia:
 * - analisar: a denúncia passa para "em análise";
 * - descartar: só esta denúncia sai da fila, sem mudar nada;
 * - manter_oculto: o produto fica fora da vitrine e as denúncias abertas dele se resolvem;
 * - mostrar: o produto volta para a vitrine e as denúncias abertas dele são descartadas;
 * - desativar_loja: a loja sai do ar e as denúncias abertas dela se resolvem.
 */
create or replace function public.moderacao_decidir(p_denuncia uuid, p_acao text, p_resolucao text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d public.denuncias%rowtype;
  v_uid uuid := auth.uid();
  v_texto text := nullif(left(trim(coalesce(p_resolucao, '')), 500), '');
  v_n integer := 0;
begin
  if not coalesce(privado.eh_equipe(array['suporte']), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into d from public.denuncias where id = p_denuncia for update;
  if d.id is null then
    raise exception 'Denúncia não encontrada' using errcode = '22023';
  end if;
  if coalesce(p_acao, '') not in ('analisar', 'descartar', 'manter_oculto', 'mostrar', 'desativar_loja') then
    raise exception 'Ação inválida' using errcode = '22023';
  end if;
  if p_acao in ('manter_oculto', 'mostrar') and d.produto_id is null then
    raise exception 'Esta denúncia é da loja, não de um produto' using errcode = '22023';
  end if;

  if p_acao = 'analisar' then
    update public.denuncias set situacao = 'em_analise' where id = d.id and situacao = 'nova';
    get diagnostics v_n = row_count;
  elsif p_acao = 'descartar' then
    update public.denuncias set situacao = 'descartada', resolvido_por = v_uid, resolvido_em = now(), resolucao = coalesce(v_texto, 'Denúncia descartada')
     where id = d.id and situacao in ('nova', 'em_analise');
    get diagnostics v_n = row_count;
  elsif p_acao = 'manter_oculto' then
    update public.produtos set oculto_moderacao = true where id = d.produto_id;
    update public.denuncias set situacao = 'resolvida', resolvido_por = v_uid, resolvido_em = now(), resolucao = coalesce(v_texto, 'O produto ficou fora da vitrine')
     where produto_id = d.produto_id and situacao in ('nova', 'em_analise');
    get diagnostics v_n = row_count;
  elsif p_acao = 'mostrar' then
    update public.produtos set oculto_moderacao = false where id = d.produto_id;
    update public.denuncias set situacao = 'descartada', resolvido_por = v_uid, resolvido_em = now(), resolucao = coalesce(v_texto, 'O produto voltou para a vitrine')
     where produto_id = d.produto_id and situacao in ('nova', 'em_analise');
    get diagnostics v_n = row_count;
  else
    update public.fornecedores set ativo = false where id = d.fornecedor_id;
    update public.denuncias set situacao = 'resolvida', resolvido_por = v_uid, resolvido_em = now(), resolucao = coalesce(v_texto, 'A loja foi desativada')
     where fornecedor_id = d.fornecedor_id and situacao in ('nova', 'em_analise');
    get diagnostics v_n = row_count;
  end if;
  return jsonb_build_object('acao', p_acao, 'denuncias', v_n);
end;
$$;

/** A equipe de suporte esconde ou mostra um produto direto (a lista dos escondidos). */
create or replace function public.moderacao_produto(p_produto bigint, p_oculto boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not coalesce(privado.eh_equipe(array['suporte']), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_produto is null or p_oculto is null then
    raise exception 'Produto inválido' using errcode = '22023';
  end if;
  update public.produtos set oculto_moderacao = p_oculto where id = p_produto;
  if not found then
    raise exception 'Produto não encontrado' using errcode = '22023';
  end if;
  if not p_oculto then
    update public.denuncias set situacao = 'descartada', resolvido_por = auth.uid(), resolvido_em = now(), resolucao = 'O produto voltou para a vitrine'
     where produto_id = p_produto and situacao in ('nova', 'em_analise');
  end if;
  insert into privado.auditoria (user_id, email, papel, acao, tabela, registro, depois)
  select auth.uid(), e.email, e.papel, case when p_oculto then 'produto_escondido' else 'produto_mostrado' end, 'public.produtos', p_produto::text,
         jsonb_build_object('oculto_moderacao', p_oculto)
    from privado.equipe e where e.user_id = auth.uid();
  return true;
end;
$$;

revoke all on function public.denunciar(uuid, bigint, bigint, text, text), public.moderacao_decidir(uuid, text, text), public.moderacao_produto(bigint, boolean) from public, anon;
grant execute on function public.denunciar(uuid, bigint, bigint, text, text), public.moderacao_decidir(uuid, text, text), public.moderacao_produto(bigint, boolean) to authenticated;

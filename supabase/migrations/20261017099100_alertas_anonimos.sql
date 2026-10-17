-- O alerta de preço passa a ser anônimo também no banco: a loja vê o que a oficina pediu, nunca qual
-- oficina pediu. Até aqui, a regra da tabela mostrava à loja a linha inteira do alerta (com a
-- oficina e se ela usou um pacote) e a resposta da loja trazia a oficina dona. Agora:
--   1. a loja lê os alertas pela vitrine (alertas_vitrine), uma cópia só com o que ela pode ver,
--      que o banco mantém a cada mudança do alerta; o tempo real da loja também vem dela;
--   2. a loja lê e grava as próprias respostas só pelas funções loja_respostas_dos_alertas e
--      loja_responder_alerta, que não devolvem a oficina. A oficina e a equipe seguem lendo as
--      tabelas como antes.

-- ------------------------------------------------------------------ 1. a vitrine dos alertas

create table if not exists public.alertas_vitrine (
  id uuid primary key references public.alertas_preco (id) on delete cascade,
  oficina_cidade text,
  oficina_uf text not null,
  categoria text not null,
  titulo text not null,
  produto_id bigint,
  chave text,
  especificacao jsonb not null default '{}'::jsonb,
  quantidade integer not null,
  preco_alvo numeric(10, 2) not null,
  mensagem text,
  status text not null,
  expira_em timestamptz not null,
  criado_em timestamptz not null
);
create index if not exists alertas_vitrine_uf_idx on public.alertas_vitrine (oficina_uf, status, expira_em);
alter table public.alertas_vitrine enable row level security;
revoke all on public.alertas_vitrine from public, anon, authenticated;
grant select on public.alertas_vitrine to authenticated;

/** Copia para a vitrine só as colunas que a loja pode ver (sem a oficina, o aparelho, o código do Pro nem o pacote). */
create or replace function privado.espelhar_alerta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.alertas_vitrine as v (id, oficina_cidade, oficina_uf, categoria, titulo, produto_id, chave, especificacao, quantidade, preco_alvo, mensagem, status, expira_em, criado_em)
  values (new.id, new.oficina_cidade, new.oficina_uf, new.categoria, new.titulo, new.produto_id, new.chave, new.especificacao, new.quantidade, new.preco_alvo, new.mensagem, new.status, new.expira_em, new.criado_em)
  on conflict (id) do update
    set oficina_cidade = excluded.oficina_cidade,
        oficina_uf = excluded.oficina_uf,
        categoria = excluded.categoria,
        titulo = excluded.titulo,
        produto_id = excluded.produto_id,
        chave = excluded.chave,
        especificacao = excluded.especificacao,
        quantidade = excluded.quantidade,
        preco_alvo = excluded.preco_alvo,
        mensagem = excluded.mensagem,
        status = excluded.status,
        expira_em = excluded.expira_em,
        criado_em = excluded.criado_em
    -- sem mudança no que a loja vê, não grava (nem manda tempo real à toa)
    where (v.oficina_cidade, v.oficina_uf, v.categoria, v.titulo, v.produto_id, v.chave, v.especificacao, v.quantidade, v.preco_alvo, v.mensagem, v.status, v.expira_em, v.criado_em)
          is distinct from
          (excluded.oficina_cidade, excluded.oficina_uf, excluded.categoria, excluded.titulo, excluded.produto_id, excluded.chave, excluded.especificacao, excluded.quantidade, excluded.preco_alvo, excluded.mensagem, excluded.status, excluded.expira_em, excluded.criado_em);
  return null;
end;
$$;
revoke all on function privado.espelhar_alerta() from public, anon, authenticated;

drop trigger if exists alertas_espelho on public.alertas_preco;
create trigger alertas_espelho after insert or update on public.alertas_preco
  for each row execute function privado.espelhar_alerta();

insert into public.alertas_vitrine (id, oficina_cidade, oficina_uf, categoria, titulo, produto_id, chave, especificacao, quantidade, preco_alvo, mensagem, status, expira_em, criado_em)
select a.id, a.oficina_cidade, a.oficina_uf, a.categoria, a.titulo, a.produto_id, a.chave, a.especificacao, a.quantidade, a.preco_alvo, a.mensagem, a.status, a.expira_em, a.criado_em
  from public.alertas_preco a
on conflict (id) do nothing;

/** A loja da pessoa respondeu este alerta? (a loja não lê mais a tabela das respostas). */
create or replace function privado.loja_respondeu(p_alerta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.alertas_respostas r
     where r.alerta_id = p_alerta
       and r.fornecedor_id in (select privado.meus_fornecedores())
  );
$$;
revoke all on function privado.loja_respondeu(uuid) from public, anon, authenticated;
grant execute on function privado.loja_respondeu(uuid) to authenticated;

-- a loja vê os alertas abertos que recebe e os que já respondeu (antes, a segunda parte nunca
-- valia: comparava a resposta com ela mesma)
drop policy if exists "Loja vê os alertas da região" on public.alertas_vitrine;
create policy "Loja vê os alertas da região" on public.alertas_vitrine for select to authenticated
  using (
    (status = 'aberto' and expira_em > now() and privado.loja_recebe_alerta(oficina_uf, categoria))
    or privado.loja_respondeu(id)
  );

-- a tabela dos alertas fica só para a oficina dona, a equipe e o sistema
drop policy if exists "Loja vê os alertas da região" on public.alertas_preco;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alertas_vitrine') then
    alter publication supabase_realtime add table public.alertas_vitrine;
  end if;
end;
$$;

-- ------------------------------------------------------------------ 2. as respostas da loja

drop policy if exists "Oficina vê as respostas" on public.alertas_respostas;
create policy "Oficina vê as respostas" on public.alertas_respostas for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe()));
drop policy if exists "Loja responde alertas" on public.alertas_respostas;
drop policy if exists "Loja muda a própria resposta" on public.alertas_respostas;

/** As respostas da loja aos alertas, sem a oficina. Só para quem é da loja. */
create or replace function public.loja_respostas_dos_alertas(p_fornecedor bigint, p_desde timestamptz default null, p_alertas uuid[] default null)
returns table (
  id uuid,
  alerta_id uuid,
  fornecedor_id bigint,
  tipo text,
  produto_id bigint,
  preco numeric,
  quantidade_minima integer,
  prazo_entrega text,
  mensagem text,
  status text,
  pedido_id bigint,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_fornecedor is null or privado.papel_no_fornecedor(p_fornecedor) is null then
    raise exception 'Sem permissão para ver as respostas desta loja' using errcode = '42501';
  end if;
  return query
    select r.id, r.alerta_id, r.fornecedor_id, r.tipo, r.produto_id, r.preco, r.quantidade_minima, r.prazo_entrega, r.mensagem, r.status, r.pedido_id, r.criado_em
      from public.alertas_respostas r
     where r.fornecedor_id = p_fornecedor
       and (p_desde is null or r.criado_em >= p_desde)
       and (p_alertas is null or r.alerta_id = any (p_alertas))
     order by r.criado_em desc
     limit 500;
end;
$$;
revoke all on function public.loja_respostas_dos_alertas(bigint, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.loja_respostas_dos_alertas(bigint, timestamptz, uuid[]) to authenticated;

/**
 * A loja aceita, faz contraproposta ou recusa um alerta. A primeira vez cria a resposta; depois,
 * muda a mesma resposta enquanto ela não foi escolhida. As regras de sempre (alerta aberto, loja do
 * estado, produto dela e da mesma categoria, produto não escondido pela moderação) ficam nos
 * gatilhos da tabela. Devolve 'nova' ou 'mudou'.
 */
create or replace function public.loja_responder_alerta(
  p_fornecedor bigint,
  p_alerta uuid,
  p_tipo text,
  p_produto bigint default null,
  p_preco numeric default null,
  p_minimo integer default null,
  p_prazo text default null,
  p_mensagem text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_atual public.alertas_respostas%rowtype;
  v_recusa boolean;
begin
  if p_fornecedor is null or p_alerta is null or privado.papel_no_fornecedor(p_fornecedor) is null then
    raise exception 'Sem permissão para responder por esta loja' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('aceita', 'contraproposta', 'recusa') then
    raise exception 'Resposta inválida' using errcode = '22023';
  end if;
  v_recusa := p_tipo = 'recusa';
  select * into v_atual
    from public.alertas_respostas r
   where r.alerta_id = p_alerta and r.fornecedor_id = p_fornecedor
   for update;
  if found then
    if v_atual.status <> 'enviada' or v_atual.pedido_id is not null then
      raise exception 'Este alerta já terminou' using errcode = 'RV004';
    end if;
    update public.alertas_respostas r
       set tipo = p_tipo,
           produto_id = case when v_recusa then null else p_produto end,
           preco = case when v_recusa then null else p_preco end,
           quantidade_minima = case when v_recusa then null else p_minimo end,
           prazo_entrega = case when v_recusa then null else nullif(btrim(p_prazo), '') end,
           mensagem = nullif(btrim(p_mensagem), ''),
           criado_em = now()
     where r.id = v_atual.id;
    return 'mudou';
  end if;
  insert into public.alertas_respostas (alerta_id, fornecedor_id, tipo, produto_id, preco, quantidade_minima, prazo_entrega, mensagem, status)
  values (
    p_alerta,
    p_fornecedor,
    p_tipo,
    case when v_recusa then null else p_produto end,
    case when v_recusa then null else p_preco end,
    case when v_recusa then null else p_minimo end,
    case when v_recusa then null else nullif(btrim(p_prazo), '') end,
    nullif(btrim(p_mensagem), ''),
    'enviada'
  );
  return 'nova';
end;
$$;
revoke all on function public.loja_responder_alerta(bigint, uuid, text, bigint, numeric, integer, text, text) from public, anon, authenticated;
grant execute on function public.loja_responder_alerta(bigint, uuid, text, bigint, numeric, integer, text, text) to authenticated;

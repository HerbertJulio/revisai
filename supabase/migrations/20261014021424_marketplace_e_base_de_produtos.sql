-- Marketplace dos fornecedores e base de prazos por produto.
-- Tudo o que é escrita passa pelo servidor do site, com a chave da equipe (cabeçalho x-revisai-equipe):
-- o painel da equipe, o painel do fornecedor (cada fornecedor só mexe no que é dele, conferido no
-- servidor) e o envio da demanda das oficinas. O público continua só lendo o catálogo ativo e a base
-- aprovada.

-- 1. Base de prazos por produto: o que o fabricante de cada produto (ou tecnologia) recomenda.
create table public.produtos_referencia (
  id bigint generated always as identity primary key,
  categoria text not null check (categoria in (
    'oleo_motor', 'filtro_oleo', 'filtro_ar', 'filtro_cabine', 'filtro_combustivel', 'vela',
    'correia_dentada', 'correia_acessorios', 'pastilha_freio', 'disco_freio', 'fluido_freio',
    'arrefecimento', 'pneu', 'bateria', 'amortecedor', 'fluido_cambio', 'higienizacao_ar', 'palheta', 'outros'
  )),
  marca text not null check (char_length(marca) between 1 and 80),
  linha text not null check (char_length(linha) between 2 and 160),
  tipo text check (char_length(tipo) <= 60),
  especificacao jsonb not null default '{}'::jsonb check (jsonb_typeof(especificacao) = 'object'),
  intervalo_km integer check (intervalo_km between 1 and 500000),
  intervalo_meses integer check (intervalo_meses between 1 and 240),
  intervalo_km_severo integer check (intervalo_km_severo between 1 and 500000),
  intervalo_meses_severo integer check (intervalo_meses_severo between 1 and 240),
  segue_manual boolean not null default false,
  observacao text check (char_length(observacao) <= 600),
  fonte_url text check (fonte_url ~ '^https?://' and char_length(fonte_url) <= 500),
  fonte_nome text check (char_length(fonte_nome) <= 160),
  confianca text not null default 'fabricante' check (confianca in ('fabricante', 'imprensa', 'mercado', 'oficina', 'fornecedor')),
  origem text not null default 'equipe' check (origem in ('equipe', 'fornecedor', 'oficina')),
  fornecedor_id bigint references public.fornecedores (id),
  aprovado boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.produtos_referencia is 'Prazo de troca recomendado pelo fabricante de cada produto ou tecnologia, com a fonte. Sugestões de oficinas e fornecedores entram como não aprovadas.';

create index produtos_referencia_categoria_idx on public.produtos_referencia (categoria);
create index produtos_referencia_fornecedor_id_idx on public.produtos_referencia (fornecedor_id);

alter table public.produtos_referencia enable row level security;
grant select on public.produtos_referencia to anon, authenticated;
grant insert, update on public.produtos_referencia to anon;

create policy "Base: referências aprovadas" on public.produtos_referencia
  for select to anon, authenticated
  using ((aprovado and ativo) or (select privado.equipe_autorizada()));

create policy "Equipe inclui na base" on public.produtos_referencia
  for insert to anon with check ((select privado.equipe_autorizada()));

create policy "Equipe edita a base" on public.produtos_referencia
  for update to anon
  using ((select privado.equipe_autorizada()))
  with check ((select privado.equipe_autorizada()));

-- 2. Fornecedores: destaque (público, muda a ordem na loja) e contrato (só a equipe vê).
alter table public.fornecedores
  add column destaque boolean not null default false,
  add column descricao text check (char_length(descricao) <= 400);

create table public.fornecedores_contrato (
  fornecedor_id bigint primary key references public.fornecedores (id),
  plano text not null default 'vitrine' check (plano in ('vitrine', 'destaque')),
  comissao_percentual numeric(4, 2) not null default 5 check (comissao_percentual between 0 and 30),
  email text check (char_length(email) <= 160 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  observacao text check (char_length(observacao) <= 300),
  atualizado_em timestamptz not null default now()
);

comment on table public.fornecedores_contrato is 'Plano e comissão combinados com cada fornecedor. Só a equipe lê e muda.';

insert into public.fornecedores_contrato (fornecedor_id) select id from public.fornecedores;

-- Link de acesso de cada fornecedor ao painel dele: o banco guarda só o hash do código do link.
create table public.fornecedores_acesso (
  fornecedor_id bigint primary key references public.fornecedores (id),
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now()
);

comment on table public.fornecedores_acesso is 'Hash SHA-256 do código do link de acesso do fornecedor. Gerar um novo link troca o hash e derruba o antigo.';

alter table public.fornecedores_contrato enable row level security;
alter table public.fornecedores_acesso enable row level security;
grant select, insert, update on public.fornecedores_contrato, public.fornecedores_acesso to anon;

create policy "Equipe vê os contratos" on public.fornecedores_contrato
  for select to anon using ((select privado.equipe_autorizada()));
create policy "Equipe cria contratos" on public.fornecedores_contrato
  for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Equipe muda contratos" on public.fornecedores_contrato
  for update to anon using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

create policy "Equipe vê os acessos" on public.fornecedores_acesso
  for select to anon using ((select privado.equipe_autorizada()));
create policy "Equipe cria acessos" on public.fornecedores_acesso
  for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Equipe troca acessos" on public.fornecedores_acesso
  for update to anon using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

-- A equipe (e o painel do fornecedor, pelo servidor) cadastra fornecedores, produtos e promoções.
grant insert, update on public.fornecedores, public.produtos, public.promocoes to anon;

create policy "Equipe cadastra fornecedores" on public.fornecedores
  for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Equipe edita fornecedores" on public.fornecedores
  for update to anon using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

create policy "Equipe cadastra produtos" on public.produtos
  for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Equipe edita produtos" on public.produtos
  for update to anon using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

create policy "Equipe cadastra promoções" on public.promocoes
  for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Equipe edita promoções" on public.promocoes
  for update to anon using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

-- 3. Produtos: foto e ligação com a base de prazos.
alter table public.produtos
  add column imagem_url text check (char_length(imagem_url) <= 500 and (imagem_url ~ '^https://' or imagem_url ~ '^/[a-z0-9/_.-]+$')),
  add column referencia_id bigint references public.produtos_referencia (id);

create index produtos_referencia_id_idx on public.produtos (referencia_id);

-- 4. Cada pedido dividido por fornecedor: cada um cuida da parte dele, e a comissão sai daqui.
create table public.pedidos_fornecedores (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos (id),
  fornecedor_id bigint not null references public.fornecedores (id),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  comissao_percentual numeric(4, 2) not null default 5 check (comissao_percentual between 0 and 30),
  status text not null default 'novo' check (status in ('novo', 'em_contato', 'confirmado', 'entregue', 'cancelado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (pedido_id, fornecedor_id)
);

create index pedidos_fornecedores_fornecedor_idx on public.pedidos_fornecedores (fornecedor_id, criado_em);

alter table public.pedidos_fornecedores enable row level security;
grant select, update (status, atualizado_em) on public.pedidos_fornecedores to anon;

create policy "Equipe vê as partes dos pedidos" on public.pedidos_fornecedores
  for select to anon using ((select privado.equipe_autorizada()));
create policy "Equipe muda a situação das partes" on public.pedidos_fornecedores
  for update to anon using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

create or replace function public.dividir_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with partes as (
    select (i ->> 'fornecedor_id')::bigint as fornecedor_id,
           round(sum((i ->> 'preco_unitario')::numeric * (i ->> 'quantidade')::numeric), 2) as subtotal
      from jsonb_array_elements(new.itens) as i
     where jsonb_typeof(i -> 'fornecedor_id') = 'number'
     group by 1
  )
  insert into public.pedidos_fornecedores (pedido_id, fornecedor_id, subtotal, comissao_percentual)
  select new.id, p.fornecedor_id, p.subtotal, coalesce(c.comissao_percentual, 5)
    from partes p
    left join public.fornecedores_contrato c on c.fornecedor_id = p.fornecedor_id
  on conflict (pedido_id, fornecedor_id) do nothing;
  return new;
end;
$$;

revoke all on function public.dividir_pedido() from public, anon, authenticated;

create trigger pedidos_dividir
after insert on public.pedidos
for each row execute function public.dividir_pedido();

-- Pedidos que já existiam.
insert into public.pedidos_fornecedores (pedido_id, fornecedor_id, subtotal, comissao_percentual, status, criado_em)
select pe.id, (i ->> 'fornecedor_id')::bigint,
       round(sum((i ->> 'preco_unitario')::numeric * (i ->> 'quantidade')::numeric), 2),
       5, pe.status, pe.criado_em
  from public.pedidos pe, jsonb_array_elements(pe.itens) as i
 where jsonb_typeof(i -> 'fornecedor_id') = 'number'
 group by pe.id, (i ->> 'fornecedor_id')::bigint, pe.status, pe.criado_em
on conflict (pedido_id, fornecedor_id) do nothing;

-- 5. Demanda das oficinas que aceitaram compartilhar: só produtos, quantidades e a cidade.
-- O id é um número aleatório do aparelho; não guarda nome, WhatsApp nem clientes da oficina.
create table public.demandas (
  id uuid primary key,
  uf text check (uf ~ '^[A-Z]{2}$'),
  cidade text check (char_length(cidade) <= 80),
  itens jsonb not null check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 200),
  atualizado_em timestamptz not null default now()
);

comment on table public.demandas is 'Previsão de compras dos próximos 30 dias das oficinas que aceitaram compartilhar (sem dados de clientes). Os fornecedores veem só a soma da região.';

create index demandas_uf_idx on public.demandas (uf, atualizado_em);

alter table public.demandas enable row level security;
grant select, insert, update on public.demandas to anon;

create policy "Equipe vê a demanda" on public.demandas
  for select to anon using ((select privado.equipe_autorizada()));
create policy "Servidor grava a demanda" on public.demandas
  for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Servidor atualiza a demanda" on public.demandas
  for update to anon using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

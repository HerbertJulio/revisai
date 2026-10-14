-- Como o fornecedor paga para aparecer mais na loja.
-- Plano Destaque (mensalidade): a loja inteira sobe na lista e ganha o selo até a data paga.
-- Impulso (avulso): um produto aparece primeiro na categoria, com o selo Patrocinado, por 7, 15 ou 30 dias,
-- no Brasil todo ou só num estado. O fornecedor pede pelo painel dele e a equipe ativa depois do pagamento.

alter table public.fornecedores
  add column destaque_ate date;

comment on column public.fornecedores.destaque_ate is 'Até quando vale o plano Destaque (null com destaque ligado: sem data para acabar).';

alter table public.fornecedores_contrato
  add column mensalidade numeric(10, 2) not null default 0 check (mensalidade >= 0);

create table public.impulsos (
  id bigint generated always as identity primary key,
  produto_id bigint not null references public.produtos (id),
  fornecedor_id bigint not null references public.fornecedores (id),
  uf text check (uf ~ '^[A-Z]{2}$'),
  dias integer not null check (dias in (7, 15, 30)),
  valor numeric(10, 2) not null check (valor >= 0),
  inicio date,
  fim date,
  status text not null default 'pedido' check (status in ('pedido', 'ativo', 'recusado', 'encerrado')),
  observacao text check (char_length(observacao) <= 300),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (status <> 'ativo' or (inicio is not null and fim is not null and fim >= inicio))
);

comment on table public.impulsos is 'Produto impulsionado (patrocinado) por um período. O público só vê os ativos que ainda não acabaram.';

create index impulsos_produto_idx on public.impulsos (produto_id);
create index impulsos_fornecedor_idx on public.impulsos (fornecedor_id, criado_em);
create index impulsos_ativos_idx on public.impulsos (fim) where status = 'ativo';

alter table public.impulsos enable row level security;
grant select, insert, update on public.impulsos to anon;
grant select on public.impulsos to authenticated;

create policy "Loja: impulsos em vigor" on public.impulsos
  for select to anon, authenticated
  using ((status = 'ativo' and fim >= (now() at time zone 'America/Sao_Paulo')::date) or (select privado.equipe_autorizada()));

create policy "Equipe e servidor registram impulsos" on public.impulsos
  for insert to anon with check ((select privado.equipe_autorizada()));

create policy "Equipe muda impulsos" on public.impulsos
  for update to anon using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

-- Painel da equipe completo: pedidos, cadastros, loja e códigos do Pro, pelas regras das tabelas (RLS).
-- O servidor do site manda a chave do painel no cabeçalho x-revisai-equipe; só com ela as políticas
-- abaixo liberam a leitura e as mudanças da equipe. Sem a chave, nada muda para o público.
-- Substitui as funções equipe_pedidos e equipe_mudar_situacao, que deixam de ser executáveis pela API
-- (nenhuma função SECURITY DEFINER fica exposta).

revoke all on function public.equipe_pedidos(text) from public, anon, authenticated;
revoke all on function public.equipe_mudar_situacao(text, bigint, text) from public, anon, authenticated;
comment on function public.equipe_pedidos(text) is 'Substituída pelas políticas do painel da equipe. Sem uso.';
comment on function public.equipe_mudar_situacao(text, bigint, text) is 'Substituída pelas políticas do painel da equipe. Sem uso.';

-- Confere a chave do cabeçalho. Fica no esquema privado, fora da API. Os papéis da API só podem
-- executá-la (é o que as políticas usam), sem ler a tabela de chaves.
create or replace function privado.equipe_autorizada()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return privado.chave_confere(
    'equipe',
    nullif(current_setting('request.headers', true), '')::json ->> 'x-revisai-equipe'
  );
exception when others then
  return false;
end;
$$;

revoke all on function privado.equipe_autorizada() from public, anon, authenticated;
grant usage on schema privado to anon, authenticated;
grant execute on function privado.equipe_autorizada() to anon, authenticated;

create policy "Ninguém pela API" on privado.chaves as restrictive for all to public using (false) with check (false);

-- Catálogo: o público segue vendo só o que está ativo; a equipe vê tudo.
alter policy "Catálogo: fornecedores ativos" on public.fornecedores
  using (ativo or (select privado.equipe_autorizada()));

alter policy "Catálogo: produtos ativos" on public.produtos
  using (
    (ativo and exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.ativo))
    or (select privado.equipe_autorizada())
  );

alter policy "Catálogo: promoções em vigor" on public.promocoes
  using (
    (ativo and fim >= (now() at time zone 'America/Sao_Paulo')::date)
    or (select privado.equipe_autorizada())
  );

-- Pedidos: a equipe lê e muda só a situação.
grant select, update (status) on public.pedidos to anon;

create policy "Equipe vê os pedidos" on public.pedidos
  for select to anon using ((select privado.equipe_autorizada()));

create policy "Equipe muda a situação dos pedidos" on public.pedidos
  for update to anon
  using ((select privado.equipe_autorizada()))
  with check ((select privado.equipe_autorizada()));

-- Cadastros: situação para a equipe marcar o que já respondeu. (O plano 'plus' gravado aqui é o Pro.)
alter table public.interessados
  add column situacao text not null default 'novo' check (situacao in ('novo', 'respondido', 'arquivado'));

alter policy "Interessados se cadastram com consentimento" on public.interessados
  with check (consentimento and situacao = 'novo');

grant select, update (situacao) on public.interessados to anon;

create policy "Equipe vê os cadastros" on public.interessados
  for select to anon using ((select privado.equipe_autorizada()));

create policy "Equipe muda a situação dos cadastros" on public.interessados
  for update to anon
  using ((select privado.equipe_autorizada()))
  with check ((select privado.equipe_autorizada()));

-- Códigos do Pro que a equipe entrega depois do pagamento. A oficina digita o código no aparelho.
create table public.assinaturas (
  id bigint generated always as identity primary key,
  oficina_nome text not null check (char_length(oficina_nome) between 2 and 120),
  oficina_whatsapp text check (oficina_whatsapp ~ '^55[0-9]{10,11}$'),
  meses integer not null check (meses between 1 and 36),
  valor numeric(10, 2) check (valor >= 0),
  ate date not null,
  codigo text not null unique check (codigo ~ '^[0-9A-Z]{16}$'),
  observacao text check (char_length(observacao) <= 300),
  criado_em timestamptz not null default now()
);

comment on table public.assinaturas is 'Códigos do Pro gerados no painel da equipe. Só a equipe lê e cria.';

create index assinaturas_criado_em_idx on public.assinaturas (criado_em);

alter table public.assinaturas enable row level security;
grant select, insert on public.assinaturas to anon;

create policy "Equipe vê as assinaturas" on public.assinaturas
  for select to anon using ((select privado.equipe_autorizada()));

create policy "Equipe cria assinaturas" on public.assinaturas
  for insert to anon with check ((select privado.equipe_autorizada()));

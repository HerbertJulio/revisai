-- O que a chave pública do site deixa ler das lojas. Até aqui, qualquer pessoa com a chave pública
-- (que vai para todo navegador) lia direto pela API as lojas inteiras (e-mail, CNPJ e a observação da
-- equipe na verificação), os preços que o app só mostra para quem entrou e o orçamento dos anúncios.
-- Agora:
--   1. sem conta, nada das tabelas da loja: o catálogo público sai do servidor, com a chave do
--      sistema, e o app tira os preços para quem não entrou;
--   2. o e-mail, o CNPJ e a observação da verificação ficam só para quem é da loja, para a equipe e
--      para o servidor, pela função lojas_dados_privados (as outras colunas seguem para o catálogo);
--   3. o valor, o clique e o teto diário dos anúncios ficam só para a loja dona e a equipe.
-- Atenção ao criar coluna nova em public.fornecedores: a leitura é por coluna. Coluna que o app lê
-- precisa entrar no grant abaixo (ou, se for dado só da loja, em lojas_dados_privados).

-- ------------------------------------------------------------------ 1. sem conta, só o servidor

drop policy if exists "Catálogo: lojas ativas" on public.fornecedores;
create policy "Catálogo: lojas ativas" on public.fornecedores for select to authenticated
  using (ativo or id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()));
create policy "Sistema lê as lojas" on public.fornecedores for select to anon
  using ((select privado.sistema_autorizado()));

drop policy if exists "Catálogo: produtos ativos" on public.produtos;
create policy "Catálogo: produtos ativos" on public.produtos for select to authenticated
  using (
    (ativo and not oculto_moderacao and exists (select 1 from public.fornecedores f where f.id = produtos.fornecedor_id and f.ativo))
    or fornecedor_id in (select privado.meus_fornecedores())
    or (select privado.eh_equipe())
  );
create policy "Sistema lê os produtos" on public.produtos for select to anon
  using ((select privado.sistema_autorizado()));

drop policy if exists "Catálogo: promoções em vigor" on public.promocoes;
create policy "Catálogo: promoções em vigor" on public.promocoes for select to authenticated
  using (
    (ativo and fim >= (now() at time zone 'America/Sao_Paulo')::date)
    or privado.fornecedor_do_produto(produto_id) in (select privado.meus_fornecedores())
    or (select privado.eh_equipe())
  );
create policy "Sistema lê as promoções" on public.promocoes for select to anon
  using ((select privado.sistema_autorizado()));

-- ------------------------------------------------------------------ 3. anúncios: só a loja dona e a equipe

drop policy if exists "Impulsos em vigor e os da loja" on public.impulsos;
create policy "Impulsos da loja" on public.impulsos for select to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()));
create policy "Sistema lê os impulsos" on public.impulsos for select to anon
  using ((select privado.sistema_autorizado()));

-- ------------------------------------------------------------------ 2. os dados da loja que não são do catálogo

do $$
declare
  v_colunas text;
begin
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into v_colunas
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'fornecedores'
     and c.column_name not in ('email', 'cnpj', 'verificacao_obs');
  execute 'revoke select on public.fornecedores from anon, authenticated';
  execute format('grant select (%s) on public.fornecedores to anon, authenticated', v_colunas);
end;
$$;

/**
 * O e-mail, o CNPJ e a observação da verificação das lojas: de quem é da loja, para a equipe e para
 * o servidor. Sem ids, todas as que a pessoa pode ver assim.
 */
create or replace function public.lojas_dados_privados(p_ids bigint[] default null)
returns table (id bigint, email text, cnpj text, verificacao_obs text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.email, f.cnpj, f.verificacao_obs
    from public.fornecedores f
   where (p_ids is null or f.id = any (p_ids))
     and (
       f.id in (select privado.meus_fornecedores())
       or privado.eh_equipe()
       or privado.sistema_autorizado()
     )
   order by f.id
   limit 2000;
$$;
revoke all on function public.lojas_dados_privados(bigint[]) from public, anon, authenticated;
grant execute on function public.lojas_dados_privados(bigint[]) to anon, authenticated;

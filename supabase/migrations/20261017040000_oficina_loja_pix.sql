-- A oficina sabe, antes de tocar em "Pagar com Pix", quais lojas já cadastraram a chave Pix.
-- Só o sim ou não: a chave em si continua saindo só pelo pix_da_parte, para o pedido confirmado.

create or replace function public.lojas_com_pix(p_ids bigint[])
returns bigint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.fornecedor_id order by x.fornecedor_id), '{}')
    from public.fornecedores_pix x
   where x.fornecedor_id = any (coalesce(p_ids, '{}'))
     and cardinality(coalesce(p_ids, '{}')) <= 200
     and auth.uid() is not null;
$$;

revoke all on function public.lojas_com_pix(bigint[]) from public, anon;
grant execute on function public.lojas_com_pix(bigint[]) to authenticated;

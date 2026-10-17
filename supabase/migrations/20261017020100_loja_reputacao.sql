-- A reputação de cada loja, calculada no banco a partir dos pedidos dos últimos 90 dias:
-- quantos pedidos, quantos a loja cancelou, quantos confirmados demoraram mais de 3 dias para
-- chegar e quanto tempo ela leva para confirmar. Loja com menos de 5 pedidos aparece como nova.
-- Só números somados: nada de oficina, cliente ou valor.

create or replace function public.reputacao_das_lojas(p_ids bigint[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ids as (
    select distinct x as id from unnest(coalesce(p_ids, '{}')) as x limit 100
  ),
  partes as (
    select pf.id, pf.fornecedor_id, pf.status, pf.cancelado_por, pf.criado_em, pf.entregue_em
      from public.pedidos_fornecedores pf
      join ids on ids.id = pf.fornecedor_id
     where pf.criado_em > now() - interval '90 days'
  ),
  confirmacao as (
    select h.parte_id, min(h.quando) as confirmado_em
      from public.pedidos_historico h
      join partes p on p.id = h.parte_id
     where h.campo = 'status' and h.para = 'confirmado'
     group by h.parte_id
  ),
  entrega as (
    select h.parte_id, min(h.quando) as entregue_em
      from public.pedidos_historico h
      join partes p on p.id = h.parte_id
     where h.campo = 'status' and h.para = 'entregue'
     group by h.parte_id
  ),
  medidas as (
    select p.fornecedor_id,
           count(*) as pedidos,
           count(*) filter (where p.cancelado_por = 'loja') as cancelados,
           count(c.parte_id) filter (where p.status <> 'cancelado') as confirmados,
           count(c.parte_id) filter (
             where p.status <> 'cancelado'
               and coalesce(e.entregue_em, p.entregue_em, now()) > c.confirmado_em + interval '3 days'
           ) as atrasados,
           avg(extract(epoch from (c.confirmado_em - p.criado_em)) / 3600.0) as horas
      from partes p
      left join confirmacao c on c.parte_id = p.id
      left join entrega e on e.parte_id = p.id
     group by p.fornecedor_id
  )
  select coalesce(jsonb_object_agg(ids.id::text,
           case when coalesce(m.pedidos, 0) < 5 then jsonb_build_object('nova', true, 'pedidos', coalesce(m.pedidos, 0))
           else jsonb_build_object(
             'nova', false,
             'pedidos', m.pedidos,
             'canceladosPct', round(100.0 * m.cancelados / m.pedidos, 1),
             'atrasoPct', case when m.confirmados > 0 then round(100.0 * m.atrasados / m.confirmados, 1) end,
             'horasParaConfirmar', round(m.horas::numeric, 1)
           ) end), '{}'::jsonb)
    from ids
    left join medidas m on m.fornecedor_id = ids.id;
$$;

revoke all on function public.reputacao_das_lojas(bigint[]) from public;
grant execute on function public.reputacao_das_lojas(bigint[]) to anon, authenticated;

-- O extrato da loja num mês: as partes de pedido que a loja confirmou (confirmado, a caminho ou
-- entregue; cancelado não entra) criadas naquele mês no horário de Brasília, a comissão de cada uma
-- (subtotal × percentual, em centavos) e a mensalidade do plano Destaque. É a base da cobrança:
-- a loja confere no painel e a equipe do financeiro cobra a partir daqui.

create or replace function public.extrato_da_loja(p_fornecedor bigint, p_mes text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_loja public.fornecedores%rowtype;
  v_contrato public.fornecedores_contrato%rowtype;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_partes jsonb;
  v_vendas numeric(12, 2);
  v_comissao numeric(12, 2);
  v_mensalidade numeric(10, 2);
begin
  if privado.papel_no_fornecedor(p_fornecedor) is null and not privado.eh_equipe(array['financeiro']) and not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_mes is null or p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido (use AAAA-MM)' using errcode = '22023';
  end if;
  select * into v_loja from public.fornecedores where id = p_fornecedor;
  if not found then
    raise exception 'Loja não encontrada' using errcode = 'P0002';
  end if;
  select * into v_contrato from public.fornecedores_contrato where fornecedor_id = p_fornecedor;
  v_inicio := (p_mes || '-01')::timestamp at time zone 'America/Sao_Paulo';
  v_fim := ((p_mes || '-01')::date + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';

  select coalesce(jsonb_agg(jsonb_build_object(
           'parteId', pf.id,
           'codigo', pf.codigo,
           'data', pf.criado_em,
           'situacao', pf.status,
           'subtotal', pf.subtotal,
           'comissaoPercentual', pf.comissao_percentual,
           'comissao', round(pf.subtotal * pf.comissao_percentual / 100, 2)
         ) order by pf.criado_em, pf.id), '[]'::jsonb),
         coalesce(sum(pf.subtotal), 0),
         coalesce(sum(round(pf.subtotal * pf.comissao_percentual / 100, 2)), 0)
    into v_partes, v_vendas, v_comissao
    from public.pedidos_fornecedores pf
   where pf.fornecedor_id = p_fornecedor
     and pf.status in ('confirmado', 'saiu_entrega', 'entregue')
     and pf.criado_em >= v_inicio and pf.criado_em < v_fim;

  v_mensalidade := case when v_contrato.plano = 'destaque' then coalesce(v_contrato.mensalidade, 0) else 0 end;

  return jsonb_build_object(
    'fornecedorId', p_fornecedor,
    'nome', v_loja.nome,
    'mes', p_mes,
    'partes', v_partes,
    'totalVendas', v_vendas,
    'totalComissao', v_comissao,
    'mensalidade', v_mensalidade,
    'destaqueAte', v_loja.destaque_ate,
    'total', v_comissao + v_mensalidade
  );
end;
$$;

revoke all on function public.extrato_da_loja(bigint, text) from public;
-- anon só passa com a chave do sistema (a rotina de cobrança); as pessoas entram como authenticated
grant execute on function public.extrato_da_loja(bigint, text) to anon, authenticated;

comment on function public.extrato_da_loja(bigint, text) is 'Extrato do mês da loja (base da cobrança): partes confirmadas, comissão e mensalidade do Destaque.';

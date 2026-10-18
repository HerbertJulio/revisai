-- Oficina (ou loja) apagada: o pagamento continua guardado (é registro fiscal, com a nota), só
-- perde o vínculo. A regra "todo pagamento tem dono" passa da tabela para a função que grava,
-- senão apagar uma oficina com pagamentos quebraria a rotina diária (on delete set null).

alter table public.pagamentos drop constraint if exists pagamentos_check;

create or replace function public.cobranca_registrar_pagamento(
  p_provedor text, p_externo text, p_tipo text, p_oficina uuid, p_fornecedor bigint, p_assinatura uuid,
  p_valor numeric, p_vencimento date, p_metodo text, p_descricao text, p_link text, p_pix text, p_boleto text,
  p_referencia text default null, p_user uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_oficina uuid := p_oficina;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_oficina is null and p_assinatura is not null then
    select oficina_id into v_oficina from public.assinaturas_pro where id = p_assinatura;
  end if;
  if (p_tipo = 'pro' and v_oficina is null) or (p_tipo = 'loja' and p_fornecedor is null) or p_tipo not in ('pro', 'loja') then
    raise exception 'Cobrança sem oficina ou loja' using errcode = '22023';
  end if;
  insert into public.pagamentos as pg (tipo, oficina_id, fornecedor_id, assinatura_id, provedor, externo, referencia, metodo, valor, vencimento,
    descricao, link_pagamento, pix_copia_cola, boleto_linha, criado_por)
  values (p_tipo, v_oficina, p_fornecedor, p_assinatura, p_provedor, nullif(p_externo, ''),
    coalesce(p_referencia, to_char(coalesce(p_vencimento, (now() at time zone 'America/Sao_Paulo')::date), 'YYYY-MM')),
    p_metodo, round(p_valor, 2), p_vencimento, left(p_descricao, 300),
    case when p_link ~ '^https://' then left(p_link, 500) end, nullif(left(p_pix, 600), ''), nullif(left(p_boleto, 80), ''), p_user)
  on conflict (provedor, externo) do update
    set valor = excluded.valor,
        vencimento = coalesce(excluded.vencimento, pg.vencimento),
        link_pagamento = coalesce(excluded.link_pagamento, pg.link_pagamento),
        pix_copia_cola = coalesce(excluded.pix_copia_cola, pg.pix_copia_cola),
        boleto_linha = coalesce(excluded.boleto_linha, pg.boleto_linha),
        assinatura_id = coalesce(pg.assinatura_id, excluded.assinatura_id),
        oficina_id = coalesce(pg.oficina_id, excluded.oficina_id),
        atualizado_em = now()
  returning id into v_id;
  return v_id;
end;
$$;

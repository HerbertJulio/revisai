-- A rotina diária também apaga a posição dos entregadores que ficou para trás (o app não consegue,
-- porque não tem acesso direto às partes dos pedidos) e os pedidos com mais de 5 anos, como a
-- política de privacidade diz. Cada passo roda separado: um erro num passo fica anotado no
-- resultado e não desfaz os outros (a rotina não pode parar de vez por causa de uma linha).

/**
 * O que vence todo dia: trocas de Pix depois de 24 horas, Destaque e impulsos que acabaram,
 * limites e acessos velhos (acessos ficam 6 meses), links vencidos, marcas de apagado antigas,
 * oficinas com exclusão pedida há 30 dias, cadastros do site parados há 2 anos, a posição dos
 * entregadores 3 dias depois da saída e os pedidos com mais de 5 anos (o que a política promete).
 */
create or replace function public.rotina_diaria()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r jsonb := '{}'::jsonb;
  n integer;
begin
  if not privado.sistema_autorizado() and coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  begin
    r := r || jsonb_build_object('pix', privado.aplicar_trocas_pix(null));
  exception when others then r := r || jsonb_build_object('erro_pix', sqlerrm);
  end;

  begin
    update public.fornecedores set destaque = false where destaque and destaque_ate is not null and destaque_ate < v_hoje;
    get diagnostics n = row_count; r := r || jsonb_build_object('destaques', n);
    update public.fornecedores_contrato c set plano = 'vitrine', atualizado_em = now()
     where c.plano = 'destaque' and exists (select 1 from public.fornecedores f where f.id = c.fornecedor_id and not f.destaque);
  exception when others then r := r || jsonb_build_object('erro_destaques', sqlerrm);
  end;

  begin
    update public.impulsos set status = 'encerrado', atualizado_em = now() where status = 'ativo' and fim < v_hoje;
    get diagnostics n = row_count; r := r || jsonb_build_object('impulsos', n);
  exception when others then r := r || jsonb_build_object('erro_impulsos', sqlerrm);
  end;

  begin
    delete from privado.limites where expira < now() - interval '1 day';
    delete from privado.acessos where quando < now() - interval '6 months';
    get diagnostics n = row_count; r := r || jsonb_build_object('acessos', n);
  exception when others then r := r || jsonb_build_object('erro_acessos', sqlerrm);
  end;

  begin
    delete from public.links_publicos where expira_em < now() - interval '30 days';
    delete from public.registros where apagado and atualizado_em < now() - interval '180 days';
    get diagnostics n = row_count; r := r || jsonb_build_object('apagados', n);
  exception when others then r := r || jsonb_build_object('erro_apagados', sqlerrm);
  end;

  -- cada oficina separada: uma que não sai não segura as outras
  declare
    v_oficina uuid;
    v_feitas integer := 0;
  begin
    for v_oficina in select o.id from public.oficinas o where o.excluir_em is not null and o.excluir_em < now() loop
      begin
        delete from public.oficinas where id = v_oficina;
        v_feitas := v_feitas + 1;
      exception when others then
        r := r || jsonb_build_object('erro_oficina_' || v_oficina::text, sqlerrm);
      end;
    end loop;
    r := r || jsonb_build_object('oficinas', v_feitas);
  end;

  begin
    delete from public.interessados where criado_em < now() - interval '2 years' and situacao <> 'novo';
    delete from public.whatsapp_codigos where expira_em < now();
    delete from public.convites where aceito_em is null and expira_em < now() - interval '30 days';
    delete from privado.auditoria where quando < now() - interval '5 years';
  exception when others then r := r || jsonb_build_object('erro_limpeza', sqlerrm);
  end;

  -- a posição do entregador some quando a entrega termina; o que sobrar, em até 3 dias
  begin
    update public.pedidos_fornecedores
       set entrega_hash = null, entrega_lat = null, entrega_lng = null, entrega_precisao = null, entrega_posicao_em = null
     where entrega_saiu_em < now() - interval '3 days' and (entrega_hash is not null or entrega_lat is not null);
    get diagnostics n = row_count; r := r || jsonb_build_object('entregas', n);
  exception when others then r := r || jsonb_build_object('erro_entregas', sqlerrm);
  end;

  -- pedidos ficam 5 anos (obrigações fiscais e defesa de direitos)
  begin
    update public.alertas_respostas set pedido_id = null
     where pedido_id in (select p.id from public.pedidos p where p.criado_em < now() - interval '5 years');
    delete from public.pedidos_fornecedores
     where pedido_id in (select p.id from public.pedidos p where p.criado_em < now() - interval '5 years');
    delete from public.pedidos where criado_em < now() - interval '5 years';
    get diagnostics n = row_count; r := r || jsonb_build_object('pedidos', n);
  exception when others then r := r || jsonb_build_object('erro_pedidos', sqlerrm);
  end;
  return r;
end;
$$;

revoke all on function public.rotina_diaria() from public, authenticated;
grant execute on function public.rotina_diaria() to anon;

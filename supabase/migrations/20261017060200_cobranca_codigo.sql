-- O código do Pro do mês pago pela assinatura, para o dono ou o gerente ligar o Pro nos
-- aparelhos da oficina (o mesmo código que a equipe mandaria pelo WhatsApp no pagamento à mão).

create or replace function public.cobranca_codigo_do_pro(p_oficina uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if coalesce(privado.papel_na_oficina(p_oficina), '') not in ('dono', 'gerente') then
    raise exception 'Só o dono ou o gerente vê o código do Pro' using errcode = '42501';
  end if;
  select a.codigo, a.ate into r
    from public.assinaturas a
   where a.oficina_id = p_oficina and a.ate >= (now() at time zone 'America/Sao_Paulo')::date
   order by a.ate desc, a.criado_em desc
   limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object('codigo', r.codigo, 'ate', r.ate);
end;
$$;

revoke all on function public.cobranca_codigo_do_pro(uuid) from public;
grant execute on function public.cobranca_codigo_do_pro(uuid) to authenticated;

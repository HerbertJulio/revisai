-- A pessoa apaga a própria conta; a oficina vê o uso do mês (cotas) num lugar só.

create or replace function public.apagar_minha_conta()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  if exists (select 1 from public.oficina_membros m where m.user_id = v_uid and m.papel = 'dono'
               and (select count(*) from public.oficina_membros x where x.oficina_id = m.oficina_id and x.papel = 'dono') = 1)
     or exists (select 1 from public.fornecedor_membros m where m.user_id = v_uid and m.papel = 'dono'
               and (select count(*) from public.fornecedor_membros x where x.fornecedor_id = m.fornecedor_id and x.papel = 'dono') = 1) then
    raise exception 'Você é o único dono de uma oficina ou loja: apague a empresa ou passe o dono para outra pessoa antes' using errcode = 'P0001';
  end if;
  if exists (select 1 from privado.equipe e where e.user_id = v_uid and e.ativo and e.papel = 'admin')
     and (select count(*) from privado.equipe e where e.ativo and e.papel = 'admin') = 1 then
    raise exception 'Você é o único admin da equipe' using errcode = 'P0001';
  end if;
  delete from auth.users where id = v_uid;
  return true;
end;
$$;

/** O que a oficina já usou no mês e quanto o plano dá. */
create or replace function public.uso_do_mes(p_oficina uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_plano text;
begin
  if privado.papel_na_oficina(p_oficina) is null and not privado.eh_equipe() then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  v_plano := privado.plano_da_oficina(p_oficina);
  return jsonb_build_object(
    'plano', v_plano,
    'mes', v_mes,
    'montagem', jsonb_build_object('usado', coalesce((select quantidade from public.uso_mensal where oficina_id = p_oficina and mes = v_mes and recurso = 'montagem'), 0), 'limite', privado.limite_do_recurso(v_plano, 'montagem')),
    'transcricao', jsonb_build_object('usado', coalesce((select quantidade from public.uso_mensal where oficina_id = p_oficina and mes = v_mes and recurso = 'transcricao'), 0), 'limite', privado.limite_do_recurso(v_plano, 'transcricao'))
  );
end;
$$;

revoke all on function public.apagar_minha_conta(), public.uso_do_mes(uuid) from public, anon;
grant execute on function public.apagar_minha_conta(), public.uso_do_mes(uuid) to authenticated;

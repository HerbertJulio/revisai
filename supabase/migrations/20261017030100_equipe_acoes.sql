-- Ações da equipe que mexem em mais de uma tabela de uma vez (dar o Pro direto para a oficina),
-- o uso dos alertas de preço por oficina, o e-mail para a consulta de acessos e o histórico dos
-- convites que a equipe faz para as lojas.

-- ------------------------------------------------------------------ Pro direto na oficina

/**
 * O financeiro dá ou estende o Pro de uma oficina: grava a assinatura (com o valor recebido,
 * para entrar nas contas) já ligada à oficina e empurra o pro_ate. Conta a partir do fim do Pro
 * atual, ou de hoje se ele já venceu.
 */
create or replace function public.equipe_dar_pro(p_oficina uuid, p_meses integer, p_valor numeric default null, p_observacao text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.oficinas%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ate date;
  v_id bigint;
  v_codigo text;
begin
  if not privado.eh_equipe(array['financeiro']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_meses is null or p_meses not between 1 and 36 then
    raise exception 'Escolha de 1 a 36 meses' using errcode = '22023';
  end if;
  if p_valor is not null and (p_valor < 0 or p_valor > 100000) then
    raise exception 'Confira o valor' using errcode = '22023';
  end if;
  select * into o from public.oficinas where id = p_oficina for update;
  if not found then
    raise exception 'Oficina não encontrada' using errcode = 'P0001';
  end if;
  v_ate := (greatest(coalesce(o.pro_ate, v_hoje), v_hoje) + make_interval(months => p_meses))::date;
  for i in 1 .. 5 loop
    v_codigo := privado.codigo_curto(16);
    begin
      insert into public.assinaturas (oficina_id, oficina_nome, oficina_whatsapp, meses, valor, ate, codigo, observacao, ativacoes)
      values (o.id, o.nome, o.whatsapp, p_meses, round(p_valor, 2), v_ate, v_codigo, nullif(left(trim(coalesce(p_observacao, '')), 300), ''), 1)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if i = 5 then
        raise;
      end if;
    end;
  end loop;
  update public.oficinas set pro_ate = v_ate where id = o.id;
  return jsonb_build_object('ate', v_ate, 'assinatura', v_id, 'codigo', v_codigo);
end;
$$;

revoke all on function public.equipe_dar_pro(uuid, integer, numeric, text) from public, anon;
grant execute on function public.equipe_dar_pro(uuid, integer, numeric, text) to authenticated;

-- ------------------------------------------------------------------ alertas de preço por oficina

/**
 * Quanto cada oficina usou dos alertas no mês (as mesmas contas da trava limitar_alertas) e os
 * pacotes extras liberados e gastos. Sem p_oficinas, todas as que têm alerta ou crédito.
 */
create or replace function public.equipe_alertas_uso(p_oficinas uuid[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inicio_mes timestamptz := (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
begin
  if not privado.eh_equipe(array['financeiro', 'suporte']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    with contam as (
      -- alerta que conta: fechado, aberto no prazo ou com resposta que não seja recusa
      select a.oficina_id, a.usou_credito, a.criado_em
        from public.alertas_preco a
       where a.oficina_id is not null
         and (p_oficinas is null or a.oficina_id = any (p_oficinas))
         and (a.status = 'fechado' or (a.status = 'aberto' and a.expira_em > now())
              or exists (select 1 from public.alertas_respostas r where r.alerta_id = a.id and r.tipo <> 'recusa'))
    ),
    creditos as (
      select c.oficina_id, sum(c.quantidade) as quantidade
        from public.alertas_creditos c
       where c.oficina_id is not null and (p_oficinas is null or c.oficina_id = any (p_oficinas))
       group by c.oficina_id
    ),
    oficinas as (
      select oficina_id from contam union select oficina_id from creditos
    )
    select jsonb_agg(jsonb_build_object(
             'oficinaId', o.oficina_id,
             'noMes', (select count(*) from contam x where x.oficina_id = o.oficina_id and not x.usou_credito and x.criado_em >= v_inicio_mes),
             'creditos', coalesce((select c.quantidade from creditos c where c.oficina_id = o.oficina_id), 0),
             'gastos', (select count(*) from contam x where x.oficina_id = o.oficina_id and x.usou_credito)
           ))
      from oficinas o
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.equipe_alertas_uso(uuid[]) from public, anon;
grant execute on function public.equipe_alertas_uso(uuid[]) to authenticated;

-- ------------------------------------------------------------------ e-mail de uma conta

/** A conta de um e-mail, para o admin consultar os acessos dela (a consulta fica no histórico). */
create or replace function public.equipe_id_do_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.eh_equipe(array['admin']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return (select u.id from auth.users u where lower(u.email) = lower(trim(coalesce(p_email, ''))) limit 1);
end;
$$;

revoke all on function public.equipe_id_do_email(text) from public, anon;
grant execute on function public.equipe_id_do_email(text) to authenticated;

-- ------------------------------------------------------------------ histórico dos convites

-- Os convites que a equipe faz (o dono de uma loja, por exemplo) entram no histórico. Os que a
-- oficina e a loja fazem entre si não: privado.auditar só grava o que a equipe e o sistema fazem.
drop trigger if exists auditar_equipe on public.convites;
create trigger auditar_equipe after insert or update or delete on public.convites
  for each row execute function privado.auditar();

-- A cota da IA conta uma vez por ordem (refazer o preenchimento da mesma ordem algumas vezes não
-- gasta de novo), e o agente do WhatsApp liga o número do mecânico à oficina pelo banco, numa
-- transação só. Pode rodar de novo sem estragar nada.

-- ------------------------------------------------------------------ cota com chave

create table if not exists privado.uso_chaves (
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  recurso text not null,
  chave text not null check (char_length(chave) between 1 and 120),
  criado_em timestamptz not null default now(),
  primary key (oficina_id, mes, recurso, chave)
);
-- quantas vezes a mesma chave já passou desde a última vez que gastou
alter table privado.uso_chaves add column if not exists usos integer not null default 1 check (usos between 1 and 1000);
alter table privado.uso_chaves enable row level security;
drop policy if exists "Ninguém pela API" on privado.uso_chaves;
create policy "Ninguém pela API" on privado.uso_chaves as restrictive for all to public using (false) with check (false);
revoke all on privado.uso_chaves from public, anon, authenticated;

drop function if exists public.consumir_cota(uuid, text, integer);
drop function if exists public.devolver_cota(uuid, text, integer);

/**
 * Gasta a cota do mês (fuso de Brasília) antes de chamar a IA. Com `p_chave` (o id da ordem),
 * a mesma ordem gasta uma vez a cada 5 preenchimentos: refazer algumas vezes não conta de novo,
 * mas a chave não vira passe livre. Passou do limite do plano, dá erro RV040 e não gasta nada.
 * Devolve `repetida` = true quando esta chamada não gastou (aí não há o que devolver se a IA falhar).
 */
create or replace function public.consumir_cota(p_oficina uuid, p_recurso text, p_quantidade integer default 1, p_chave text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_por_chave constant integer := 5;
  v_plano text;
  v_limite integer;
  v_usado integer;
  v_usos integer;
begin
  if privado.papel_na_oficina(p_oficina) is null and not privado.sistema_autorizado() then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if p_quantidade < 1 or p_quantidade > 10 or p_recurso not in ('montagem', 'transcricao') then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;
  v_plano := privado.plano_da_oficina(p_oficina);
  if v_plano is null then
    raise exception 'Oficina não encontrada' using errcode = '42501';
  end if;
  v_limite := privado.limite_do_recurso(v_plano, p_recurso);
  if p_chave is not null then
    insert into privado.uso_chaves as k (oficina_id, mes, recurso, chave)
    values (p_oficina, v_mes, p_recurso, left(p_chave, 120))
    on conflict (oficina_id, mes, recurso, chave) do update set usos = k.usos + 1
    returning usos into v_usos;
    if v_usos between 2 and v_por_chave then
      select coalesce((select quantidade from public.uso_mensal where oficina_id = p_oficina and mes = v_mes and recurso = p_recurso), 0) into v_usado;
      return jsonb_build_object('plano', v_plano, 'usado', v_usado, 'limite', v_limite, 'repetida', true);
    end if;
    if v_usos > v_por_chave then
      -- a chave já passou várias vezes: esta gasta de novo e a conta da chave recomeça
      update privado.uso_chaves set usos = 1 where oficina_id = p_oficina and mes = v_mes and recurso = p_recurso and chave = left(p_chave, 120);
    end if;
  end if;
  insert into public.uso_mensal as u (oficina_id, mes, recurso, quantidade)
  values (p_oficina, v_mes, p_recurso, p_quantidade)
  on conflict (oficina_id, mes, recurso) do update set quantidade = u.quantidade + excluded.quantidade
  returning quantidade into v_usado;
  if v_usado > v_limite then
    raise exception 'Cota do mês acabou' using errcode = 'RV040', detail = jsonb_build_object('plano', v_plano, 'limite', v_limite)::text;
  end if;
  return jsonb_build_object('plano', v_plano, 'usado', v_usado, 'limite', v_limite, 'repetida', false);
end;
$$;

/**
 * Devolve a cota quando a IA falhou numa chamada que gastou (só o servidor, com a chave do
 * sistema); a chave sai junto, e a próxima tentativa da mesma ordem gasta de novo.
 */
create or replace function public.devolver_cota(p_oficina uuid, p_recurso text, p_quantidade integer default 1, p_chave text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_dia bigint := floor(extract(epoch from now()) / 86400)::bigint;
  v_n integer;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  -- até 30 devoluções por dia por oficina: depois disso a falha conta (áudio vazio em série não sai de graça)
  insert into privado.limites as l (chave, janela, n, expira)
  values ('devolucao:' || p_oficina::text, v_dia, 1, to_timestamp((v_dia + 1) * 86400))
  on conflict (chave, janela) do update set n = l.n + 1
  returning n into v_n;
  if v_n > 30 then
    return false;
  end if;
  if p_chave is not null then
    delete from privado.uso_chaves where oficina_id = p_oficina and mes = v_mes and recurso = p_recurso and chave = left(p_chave, 120);
    if not found then
      return false;
    end if;
  end if;
  update public.uso_mensal set quantidade = greatest(quantidade - least(greatest(p_quantidade, 0), 10), 0)
   where oficina_id = p_oficina and recurso = p_recurso and mes = v_mes;
  return found;
end;
$$;

/** As chaves de meses passados não servem mais (a cota zera todo mês). */
create or replace function public.limpar_uso_chaves()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not privado.sistema_autorizado() and coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  delete from privado.uso_chaves where mes < to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.consumir_cota(uuid, text, integer, text), public.devolver_cota(uuid, text, integer, text), public.limpar_uso_chaves() from public;
grant execute on function public.consumir_cota(uuid, text, integer, text) to anon, authenticated;
grant execute on function public.devolver_cota(uuid, text, integer, text), public.limpar_uso_chaves() to anon;

-- ------------------------------------------------------------------ agente do WhatsApp

alter table public.ordens_rascunho add column if not exists tentativas integer not null default 0 check (tentativas between 0 and 100);

/**
 * O código de 8 números que liga o WhatsApp do mecânico à oficina, sorteado com o gerador seguro
 * do banco (o random() comum dá para prever). Vale 15 minutos e uma vez; cada código novo apaga o
 * anterior da oficina.
 */
create or replace function public.whatsapp_gerar_codigo(p_oficina uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_codigo text;
  v_nome text;
begin
  if privado.papel_na_oficina(p_oficina) is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if (select count(*) from public.whatsapp_codigos where oficina_id = p_oficina and criado_em > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos códigos seguidos' using errcode = 'P0001';
  end if;
  select nome into v_nome from public.oficinas where id = p_oficina and ativa;
  if v_nome is null then
    raise exception 'Oficina não encontrada' using errcode = '42501';
  end if;
  delete from public.whatsapp_codigos where oficina_id = p_oficina;
  loop
    v_codigo := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint) % 100000000)::text, 8, '0');
    begin
      insert into public.whatsapp_codigos (codigo, oficina_id, oficina_nome, expira_em)
      values (v_codigo, p_oficina, v_nome, now() + interval '15 minutes');
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  return v_codigo;
end;
$$;

revoke all on function public.whatsapp_gerar_codigo(uuid) from public, anon;
grant execute on function public.whatsapp_gerar_codigo(uuid) to authenticated;

/**
 * Liga o WhatsApp de quem mandou o código à oficina do código. O código é apagado na hora
 * (vale uma vez). Devolve a oficina, ou null quando o código não existe ou venceu.
 */
create or replace function public.whatsapp_vincular(p_telefone text, p_codigo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.whatsapp_codigos%rowtype;
  v_nome text;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_telefone !~ '^55[0-9]{10,11}$' or p_codigo !~ '^[0-9]{6,10}$' then
    return null;
  end if;
  select * into c from public.whatsapp_codigos where codigo = p_codigo for update;
  if not found or c.oficina_id is null or c.expira_em < now() then
    return null;
  end if;
  delete from public.whatsapp_codigos where codigo = p_codigo;
  select nome into v_nome from public.oficinas where id = c.oficina_id and ativa;
  if v_nome is null then
    return null;
  end if;
  if (select count(*) from public.whatsapp_vinculos where oficina_id = c.oficina_id and telefone <> p_telefone) >= 20 then
    raise exception 'Números demais ligados à oficina' using errcode = 'P0001';
  end if;
  insert into public.whatsapp_vinculos (telefone, oficina_id, oficina_nome, aparelho_id, criado_em)
  values (p_telefone, c.oficina_id, v_nome, null, now())
  on conflict (telefone) do update set oficina_id = excluded.oficina_id, oficina_nome = excluded.oficina_nome, aparelho_id = null, criado_em = now();
  return jsonb_build_object('oficinaId', c.oficina_id, 'oficina', v_nome);
end;
$$;

/** De qual oficina é este WhatsApp, e o plano dela hoje (o agente é do Pro e do teste). */
create or replace function public.whatsapp_contexto(p_telefone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object('oficinaId', o.id, 'oficina', o.nome, 'plano', privado.plano_da_oficina(o.id))
      from public.whatsapp_vinculos v join public.oficinas o on o.id = v.oficina_id and o.ativa
     where v.telefone = p_telefone
  );
end;
$$;

revoke all on function public.whatsapp_vincular(text, text), public.whatsapp_contexto(text) from public, authenticated;
grant execute on function public.whatsapp_vincular(text, text), public.whatsapp_contexto(text) to anon;

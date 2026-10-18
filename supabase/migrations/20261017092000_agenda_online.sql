-- Agendamento pelo link público: a oficina liga um endereço (/agendar/<código>) em que o cliente
-- escolhe um horário livre e pede para marcar. O banco guarda a configuração pública (horários da
-- semana, vagas, antecedência, serviços) e os pedidos; a oficina aceita ou recusa no app, e o
-- horário aceito vira um agendamento da agenda dela (coleção 'agendamentos' dos registros).
-- Os horários livres do link descontam os agendamentos da oficina e os pedidos ainda abertos.
-- Pode rodar de novo sem estragar nada.

-- ------------------------------------------------------------------ ajudas

/** '08:30' vira 510 (minutos desde a meia-noite); hora inválida vira null. */
create or replace function privado.agenda_minutos(p text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or p !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return null;
  end if;
  return split_part(p, ':', 1)::integer * 60 + split_part(p, ':', 2)::integer;
end;
$$;

/** 510 vira '08:30'. */
create or replace function privado.agenda_hora(p integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select lpad((p / 60)::text, 2, '0') || ':' || lpad((p % 60)::text, 2, '0');
$$;

/** O fuso da oficina (guardado na configuração); se não valer, o de Brasília. */
create or replace function privado.agenda_fuso(p_config jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := coalesce(nullif(p_config ->> 'fuso', ''), 'America/Sao_Paulo');
  v_teste timestamp;
begin
  begin
    v_teste := now() at time zone v;
  exception when others then
    v := 'America/Sao_Paulo';
  end;
  return v;
end;
$$;

/**
 * Confere e arruma a configuração pública. Erro 22023 quando algo não vale.
 * semana: 7 listas (domingo a sábado) de períodos {inicio, fim} 'HH:MM'; intervaloMin 10 a 240;
 * vagas 1 a 20; diasAFrente 1 a 90; antecedenciaHoras 0 a 168; servicos: até 20 nomes;
 * mensagem: até 300 letras; folgas: até 120 datas; fuso: nome de fuso do Postgres.
 */
create or replace function privado.agenda_config(p jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_semana jsonb := '[]'::jsonb;
  v_dia jsonb;
  v_periodos jsonb;
  v_p jsonb;
  v_servicos jsonb := '[]'::jsonb;
  v_folgas jsonb := '[]'::jsonb;
  v_s text;
  v_fuso text := coalesce(nullif(p ->> 'fuso', ''), 'America/Sao_Paulo');
  v_mensagem text := nullif(trim(coalesce(p ->> 'mensagem', '')), '');
  v_numeros jsonb := '{}'::jsonb;
  v_campo text;
  v_valor integer;
  v_lim record;
  d date;
  i integer;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Configuração inválida' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'semana') is distinct from 'array' or jsonb_array_length(p -> 'semana') <> 7 then
    raise exception 'Horários da semana inválidos' using errcode = '22023';
  end if;
  for i in 0 .. 6 loop
    v_dia := p -> 'semana' -> i;
    v_periodos := '[]'::jsonb;
    if jsonb_typeof(v_dia) = 'array' then
      if jsonb_array_length(v_dia) > 4 then
        raise exception 'Períodos demais num dia' using errcode = '22023';
      end if;
      for v_p in select value from jsonb_array_elements(v_dia) loop
        if privado.agenda_minutos(v_p ->> 'inicio') is null or privado.agenda_minutos(v_p ->> 'fim') is null
           or privado.agenda_minutos(v_p ->> 'inicio') >= privado.agenda_minutos(v_p ->> 'fim') then
          raise exception 'Horário de trabalho inválido' using errcode = '22023';
        end if;
        v_periodos := v_periodos || jsonb_build_array(jsonb_build_object('inicio', v_p ->> 'inicio', 'fim', v_p ->> 'fim'));
      end loop;
    elsif v_dia is not null and jsonb_typeof(v_dia) <> 'null' then
      raise exception 'Horários da semana inválidos' using errcode = '22023';
    end if;
    v_semana := v_semana || jsonb_build_array(v_periodos);
  end loop;

  for v_lim in select * from (values ('intervaloMin', 10, 240, 30), ('vagas', 1, 20, 1), ('diasAFrente', 1, 90, 30), ('antecedenciaHoras', 0, 168, 2)) x (campo, minimo, maximo, padrao) loop
    v_campo := v_lim.campo;
    if p ? v_campo and jsonb_typeof(p -> v_campo) <> 'null' then
      if jsonb_typeof(p -> v_campo) <> 'number' or (p ->> v_campo) !~ '^[0-9]{1,4}$' then
        raise exception 'Número inválido: %', v_campo using errcode = '22023';
      end if;
      v_valor := (p ->> v_campo)::integer;
      if v_valor < v_lim.minimo or v_valor > v_lim.maximo then
        raise exception 'Número fora da faixa: %', v_campo using errcode = '22023';
      end if;
    else
      v_valor := v_lim.padrao;
    end if;
    v_numeros := v_numeros || jsonb_build_object(v_campo, v_valor);
  end loop;

  if p ? 'servicos' and jsonb_typeof(p -> 'servicos') <> 'null' then
    if jsonb_typeof(p -> 'servicos') <> 'array' or jsonb_array_length(p -> 'servicos') > 20 then
      raise exception 'Serviços inválidos' using errcode = '22023';
    end if;
    for v_s in select trim(value) from jsonb_array_elements_text(p -> 'servicos') loop
      if char_length(v_s) not between 1 and 60 then
        raise exception 'Nome de serviço inválido' using errcode = '22023';
      end if;
      if not v_servicos ? v_s then
        v_servicos := v_servicos || to_jsonb(v_s);
      end if;
    end loop;
  end if;

  if p ? 'folgas' and jsonb_typeof(p -> 'folgas') <> 'null' then
    if jsonb_typeof(p -> 'folgas') <> 'array' or jsonb_array_length(p -> 'folgas') > 120 then
      raise exception 'Folgas inválidas' using errcode = '22023';
    end if;
    for v_s in select value from jsonb_array_elements_text(p -> 'folgas') loop
      if v_s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Data de folga inválida' using errcode = '22023';
      end if;
      begin
        d := v_s::date;
      exception when others then
        raise exception 'Data de folga inválida' using errcode = '22023';
      end;
      if to_char(d, 'YYYY-MM-DD') <> v_s then
        raise exception 'Data de folga inválida' using errcode = '22023';
      end if;
      if not v_folgas ? v_s then
        v_folgas := v_folgas || to_jsonb(v_s);
      end if;
    end loop;
  end if;

  if char_length(v_mensagem) > 300 then
    raise exception 'Mensagem longa demais' using errcode = '22023';
  end if;
  if v_fuso !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_fuso) then
    raise exception 'Fuso inválido' using errcode = '22023';
  end if;

  return jsonb_build_object('semana', v_semana, 'servicos', v_servicos, 'folgas', v_folgas, 'mensagem', v_mensagem, 'fuso', v_fuso) || v_numeros;
end;
$$;

revoke all on function privado.agenda_minutos(text), privado.agenda_hora(integer), privado.agenda_fuso(jsonb), privado.agenda_config(jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------ configuração pública

create table if not exists public.agenda_publica (
  oficina_id uuid primary key references public.oficinas (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]{10,40}$'),
  ativo boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 20000),
  atualizado_em timestamptz not null default now()
);

comment on table public.agenda_publica is 'O link de agendamento de cada oficina: o código do endereço, se está ligado e a configuração que o cliente vê. Só muda pela agenda_publicar.';

alter table public.agenda_publica enable row level security;
revoke all on public.agenda_publica from anon, authenticated;
grant select on public.agenda_publica to authenticated;
drop policy if exists "Membros veem o link de agendamento" on public.agenda_publica;
create policy "Membros veem o link de agendamento" on public.agenda_publica for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()));

-- ------------------------------------------------------------------ pedidos de horário

create table if not exists public.agendamentos_online (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  data date not null,
  hora text not null check (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  duracao_min integer not null check (duracao_min between 5 and 480),
  nome text not null check (char_length(nome) between 2 and 80),
  telefone text not null check (telefone ~ '^55[0-9]{10,11}$'),
  placa text check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  servico text not null check (char_length(servico) between 1 and 80),
  observacao text check (char_length(observacao) <= 300),
  situacao text not null default 'novo' check (situacao in ('novo', 'aceito', 'recusado', 'cancelado')),
  criado_em timestamptz not null default now(),
  respondido_em timestamptz,
  agendamento_id text check (char_length(agendamento_id) between 1 and 100),
  consentimento boolean not null check (consentimento)
);
create index if not exists agendamentos_online_dia_idx on public.agendamentos_online (oficina_id, data, situacao);
create index if not exists agendamentos_online_novos_idx on public.agendamentos_online (oficina_id, criado_em desc) where situacao = 'novo';

comment on table public.agendamentos_online is 'Pedidos de horário feitos pelo link público da oficina (nome, WhatsApp e placa que o cliente digitou, com o consentimento). Só a oficina lê; muda pela agenda_responder. Saem 90 dias depois do dia pedido.';

alter table public.agendamentos_online enable row level security;
revoke all on public.agendamentos_online from anon, authenticated;
grant select on public.agendamentos_online to authenticated;
drop policy if exists "Membros veem os pedidos de horário" on public.agendamentos_online;
create policy "Membros veem os pedidos de horário" on public.agendamentos_online for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()));

-- ------------------------------------------------------------------ horários livres

/**
 * Os horários livres da oficina entre duas datas, que começam a partir de `p_minimo` (no relógio
 * da oficina): a grade da semana sem as folgas, menos os agendamentos da agenda (registros, menos
 * cancelados e faltas) e os pedidos pelo link que ainda seguram a vaga (novos, e aceitos que
 * ainda não chegaram à agenda). Um horário fica livre enquanto os que o tocam são menos que as vagas.
 */
create or replace function privado.agenda_livres(p_oficina uuid, p_config jsonb, p_de date, p_ate date, p_minimo timestamp)
returns table (dia date, horario text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_intervalo integer := greatest(coalesce((p_config ->> 'intervaloMin')::integer, 30), 10);
  v_vagas integer := greatest(coalesce((p_config ->> 'vagas')::integer, 1), 1);
begin
  return query
  with ocupado as materialized (
    select r.dados ->> 'data' as d,
           privado.agenda_minutos(r.dados ->> 'hora') as ini,
           privado.agenda_minutos(r.dados ->> 'hora')
             + least(greatest(coalesce(case when r.dados ->> 'duracaoMin' ~ '^[0-9]{1,4}$' then (r.dados ->> 'duracaoMin')::integer end, v_intervalo), 5), 1440) as fim
      from public.registros r
     where r.oficina_id = p_oficina
       and r.colecao = 'agendamentos'
       and not r.apagado
       and r.dados ->> 'data' between to_char(p_de, 'YYYY-MM-DD') and to_char(p_ate, 'YYYY-MM-DD')
       and coalesce(r.dados ->> 'situacao', 'marcado') not in ('cancelado', 'faltou')
       and privado.agenda_minutos(r.dados ->> 'hora') is not null
    union all
    select to_char(o.data, 'YYYY-MM-DD'), privado.agenda_minutos(o.hora), privado.agenda_minutos(o.hora) + o.duracao_min
      from public.agendamentos_online o
     where o.oficina_id = p_oficina
       and o.data between p_de and p_ate
       -- pedido sem resposta segura o horário só por 24 horas (pedidos de mentira não fecham a agenda)
       and ((o.situacao = 'novo' and o.criado_em > now() - interval '24 hours')
            or (o.situacao = 'aceito' and not exists (
                  select 1 from public.registros x where x.oficina_id = o.oficina_id and x.colecao = 'agendamentos' and x.id = o.agendamento_id)))
  ),
  dias as (
    select g::date as d
      from generate_series(p_de::timestamp, p_ate::timestamp, interval '1 day') g
     where not coalesce(p_config -> 'folgas', '[]'::jsonb) ? to_char(g, 'YYYY-MM-DD')
  ),
  grade as (
    select dias.d, m as ini
      from dias
      cross join lateral jsonb_array_elements(coalesce(p_config -> 'semana' -> extract(dow from dias.d)::integer, '[]'::jsonb)) per
      cross join lateral generate_series(privado.agenda_minutos(per ->> 'inicio'), privado.agenda_minutos(per ->> 'fim') - v_intervalo, v_intervalo) m
  )
  select g.d, privado.agenda_hora(g.ini)
    from grade g
   where g.d + make_interval(mins => g.ini) >= p_minimo
     and (select count(*) from ocupado oc where oc.d = to_char(g.d, 'YYYY-MM-DD') and oc.ini < g.ini + v_intervalo and g.ini < oc.fim) < v_vagas
   order by g.d, g.ini;
end;
$$;

revoke all on function privado.agenda_livres(uuid, jsonb, date, date, timestamp) from public, anon, authenticated;

/** O hash do IP de quem chamou (pelos cabeçalhos que o gateway põe), para o limite de pedidos. */
create or replace function privado.agenda_ip_hash()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_h json;
  v_ip text;
begin
  begin
    v_h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_h := null;
  end;
  v_ip := coalesce(nullif(trim(v_h ->> 'cf-connecting-ip'), ''), nullif(trim(v_h ->> 'x-real-ip'), ''), nullif(trim(split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1)), ''), 'sem-ip');
  return encode(sha256(convert_to('agenda:' || v_ip, 'UTF8')), 'hex');
end;
$$;

/** Conta mais um na janela (como a limite_consumir, mas só para as funções da agenda). */
create or replace function privado.agenda_limite(p_chave text, p_max integer, p_segundos integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_janela bigint := floor(extract(epoch from now()) / greatest(p_segundos, 1))::bigint;
  v_n integer;
begin
  insert into privado.limites as l (chave, janela, n, expira)
  values (left(p_chave, 200), v_janela, 1, to_timestamp((v_janela + 1) * greatest(p_segundos, 1)))
  on conflict (chave, janela) do update set n = l.n + 1
  returning n into v_n;
  return v_n <= p_max;
end;
$$;

revoke all on function privado.agenda_ip_hash(), privado.agenda_limite(text, integer, integer) from public, anon, authenticated;

-- ------------------------------------------------------------------ a oficina liga o link

/**
 * Liga, desliga ou muda o link de agendamento (só dono e gerente). Na primeira vez sorteia o
 * código do endereço; depois ele não muda. Devolve o código.
 */
create or replace function public.agenda_publicar(p_oficina uuid, p_ativo boolean, p_config jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_config jsonb;
  v_slug text;
  v_tentativa integer := 0;
begin
  if coalesce(privado.papel_na_oficina(p_oficina), '') not in ('dono', 'gerente') then
    raise exception 'Só o dono ou o gerente mudam o agendamento pelo link' using errcode = '42501';
  end if;
  if not exists (select 1 from public.oficinas o where o.id = p_oficina and o.ativa) then
    raise exception 'Oficina desativada' using errcode = '42501';
  end if;
  v_config := privado.agenda_config(p_config);
  loop
    update public.agenda_publica set ativo = coalesce(p_ativo, false), config = v_config, atualizado_em = now()
     where oficina_id = p_oficina
     returning slug into v_slug;
    if found then
      return v_slug;
    end if;
    v_tentativa := v_tentativa + 1;
    if v_tentativa > 5 then
      raise exception 'Não deu para criar o link agora' using errcode = 'P0001';
    end if;
    begin
      v_slug := lower(privado.codigo_curto(10));
      insert into public.agenda_publica (oficina_id, slug, ativo, config) values (p_oficina, v_slug, coalesce(p_ativo, false), v_config);
      return v_slug;
    exception when unique_violation then
      -- o código já existe, ou outro aparelho criou o link desta oficina agora: tenta de novo
      null;
    end;
  end loop;
end;
$$;

/**
 * A oficina responde um pedido de horário: aceito (com o id do agendamento que entrou na agenda),
 * recusado ou cancelado. Responder de novo a mesma coisa não muda nada (dois aparelhos ao mesmo
 * tempo); o aceito devolve o agendamento que valeu.
 */
create or replace function public.agenda_responder(p_id uuid, p_situacao text, p_agendamento_id text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.agendamentos_online%rowtype;
begin
  select * into r from public.agendamentos_online where id = p_id for update;
  if not found or privado.papel_na_oficina(r.oficina_id) is null then
    raise exception 'Pedido não encontrado' using errcode = '42501';
  end if;
  if p_situacao is null or p_situacao not in ('aceito', 'recusado', 'cancelado') then
    raise exception 'Resposta inválida' using errcode = '22023';
  end if;
  if p_agendamento_id is not null and char_length(p_agendamento_id) not between 1 and 100 then
    raise exception 'Agendamento inválido' using errcode = '22023';
  end if;
  if r.situacao = p_situacao then
    return jsonb_build_object('id', r.id, 'situacao', r.situacao, 'agendamentoId', r.agendamento_id, 'respondidoEm', r.respondido_em);
  end if;
  if not (r.situacao = 'novo' or (r.situacao = 'aceito' and p_situacao = 'cancelado')) then
    raise exception 'Este pedido já foi respondido' using errcode = 'RV074';
  end if;
  update public.agendamentos_online
     set situacao = p_situacao, respondido_em = now(),
         agendamento_id = case when p_situacao = 'aceito' then coalesce(p_agendamento_id, agendamento_id) else agendamento_id end
   where id = p_id
   returning * into r;
  return jsonb_build_object('id', r.id, 'situacao', r.situacao, 'agendamentoId', r.agendamento_id, 'respondidoEm', r.respondido_em);
end;
$$;

revoke all on function public.agenda_publicar(uuid, boolean, jsonb), public.agenda_responder(uuid, text, text) from public, anon;
grant execute on function public.agenda_publicar(uuid, boolean, jsonb), public.agenda_responder(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------ o cliente, pelo link (sem conta)

/** O link que vale: ligado e de oficina ativa. */
create or replace function privado.agenda_do_link(p_slug text)
returns public.agenda_publica
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.agenda_publica%rowtype;
begin
  if coalesce(p_slug, '') !~ '^[a-z0-9]{10,40}$' then
    return null;
  end if;
  select ap.* into a from public.agenda_publica ap join public.oficinas o on o.id = ap.oficina_id
   where ap.slug = p_slug and ap.ativo and o.ativa;
  if not found then
    return null;
  end if;
  return a;
end;
$$;
revoke all on function privado.agenda_do_link(text) from public, anon, authenticated;

/** O que a página do link mostra: a oficina (sem dados pessoais) e a configuração. Null se o link não vale. */
create or replace function public.agenda_ver(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.agenda_publica%rowtype := privado.agenda_do_link(p_slug);
  o public.oficinas%rowtype;
begin
  if a.oficina_id is null then
    return null;
  end if;
  select * into o from public.oficinas where id = a.oficina_id;
  return jsonb_build_object(
    'oficina', jsonb_build_object('nome', o.nome, 'cidade', o.cidade, 'uf', o.uf, 'endereco', o.endereco),
    'config', jsonb_build_object(
      'semana', a.config -> 'semana', 'intervaloMin', a.config -> 'intervaloMin', 'diasAFrente', a.config -> 'diasAFrente',
      'antecedenciaHoras', a.config -> 'antecedenciaHoras', 'servicos', coalesce(a.config -> 'servicos', '[]'::jsonb), 'mensagem', a.config -> 'mensagem'),
    'hoje', to_char((now() at time zone privado.agenda_fuso(a.config))::date, 'YYYY-MM-DD')
  );
end;
$$;

/**
 * Os horários livres do link, de p_de até p_ate (no máximo 62 dias, dentro dos dias que a oficina
 * abre para pedido e depois da antecedência): [{data, horas: ['08:00', ...]}], só dias com horário.
 * Null se o link não vale.
 */
create or replace function public.agenda_horarios(p_slug text, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.agenda_publica%rowtype := privado.agenda_do_link(p_slug);
  v_agora timestamp;
  v_hoje date;
  v_de date;
  v_ate date;
begin
  if a.oficina_id is null then
    return null;
  end if;
  v_agora := now() at time zone privado.agenda_fuso(a.config);
  v_hoje := v_agora::date;
  v_de := greatest(coalesce(p_de, v_hoje), v_hoje);
  v_ate := least(coalesce(p_ate, v_hoje + (a.config ->> 'diasAFrente')::integer), v_hoje + (a.config ->> 'diasAFrente')::integer, v_de + 62);
  if v_ate < v_de then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('data', to_char(x.dia, 'YYYY-MM-DD'), 'horas', x.horas) order by x.dia)
      from (
        select l.dia, jsonb_agg(l.horario order by l.horario) as horas
          from privado.agenda_livres(a.oficina_id, a.config, v_de, v_ate, v_agora + make_interval(hours => (a.config ->> 'antecedenciaHoras')::integer)) l
         group by l.dia
      ) x
  ), '[]'::jsonb);
end;
$$;

/**
 * O cliente pede um horário pelo link. Confere o consentimento, os dados, se o horário ainda está
 * livre (com a antecedência e os dias que a oficina abre) e os limites (por IP e por oficina, por
 * dia). Dois pedidos para o mesmo dia da oficina esperam um pelo outro: a última vaga não sai duas
 * vezes. O mesmo pedido repetido (toque duplo) devolve o que já existe.
 * `p_ip_hash` só vale quando quem chama é o servidor do Revisaí (com a chave do sistema).
 */
create or replace function public.agenda_pedir(
  p_slug text, p_data date, p_hora text, p_nome text, p_telefone text,
  p_placa text default null, p_servico text default null, p_observacao text default null,
  p_consentimento boolean default false, p_ip_hash text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.agenda_publica%rowtype := privado.agenda_do_link(p_slug);
  v_nome text := left(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), 80);
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_placa text := nullif(upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_servico text := nullif(left(regexp_replace(trim(coalesce(p_servico, '')), '\s+', ' ', 'g'), 80), '');
  v_obs text := nullif(trim(coalesce(p_observacao, '')), '');
  v_ip text;
  v_agora timestamp;
  v_id uuid;
begin
  if not coalesce(p_consentimento, false) then
    raise exception 'Para pedir o horário, aceite enviar seus dados para a oficina' using errcode = 'RV073';
  end if;
  if a.oficina_id is null then
    raise exception 'Este link de agendamento não está ligado' using errcode = 'RV070';
  end if;
  if char_length(v_nome) < 2 then
    raise exception 'Escreva o seu nome' using errcode = '22023';
  end if;
  if v_tel ~ '^[0-9]{10,11}$' then
    v_tel := '55' || v_tel;
  end if;
  if v_tel !~ '^55[0-9]{10,11}$' then
    raise exception 'Confira o WhatsApp, com DDD' using errcode = '22023';
  end if;
  if v_placa is not null and v_placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'Confira a placa' using errcode = '22023';
  end if;
  if char_length(v_obs) > 300 then
    raise exception 'A observação passou de 300 letras' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(a.config -> 'servicos', '[]'::jsonb)) > 0 then
    if v_servico is null or not (a.config -> 'servicos') ? v_servico then
      raise exception 'Escolha um dos serviços' using errcode = '22023';
    end if;
  elsif v_servico is null then
    raise exception 'Escreva o serviço' using errcode = '22023';
  end if;
  if p_data is null or privado.agenda_minutos(p_hora) is null then
    raise exception 'Escolha o dia e a hora' using errcode = '22023';
  end if;

  -- toque duplo: o mesmo pedido, ainda aberto, volta como está (não conta no limite)
  select id into v_id from public.agendamentos_online
   where oficina_id = a.oficina_id and telefone = v_tel and data = p_data and hora = p_hora and situacao = 'novo';
  if found then
    return jsonb_build_object('id', v_id, 'data', to_char(p_data, 'YYYY-MM-DD'), 'hora', p_hora, 'repetido', true);
  end if;

  v_ip := case when p_ip_hash ~ '^[0-9a-f]{64}$' and privado.sistema_autorizado() then p_ip_hash else privado.agenda_ip_hash() end;
  if not privado.agenda_limite('agenda-ip:' || v_ip, 5, 3600) or not privado.agenda_limite('agenda-ip-dia:' || v_ip, 15, 86400) then
    raise exception 'Muitos pedidos seguidos. Tente mais tarde ou fale com a oficina.' using errcode = 'RV072';
  end if;
  if not privado.agenda_limite('agenda-oficina:' || a.oficina_id::text, 60, 86400) then
    raise exception 'A oficina recebeu pedidos demais hoje. Fale com ela pelo WhatsApp.' using errcode = 'RV072';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('agenda:' || a.oficina_id::text || ':' || p_data::text, 0));
  v_agora := now() at time zone privado.agenda_fuso(a.config);
  if p_data > v_agora::date + (a.config ->> 'diasAFrente')::integer
     or not exists (
       select 1 from privado.agenda_livres(a.oficina_id, a.config, p_data, p_data, v_agora + make_interval(hours => (a.config ->> 'antecedenciaHoras')::integer)) l
        where l.horario = p_hora) then
    raise exception 'Este horário não está mais livre' using errcode = 'RV071';
  end if;

  insert into public.agendamentos_online (oficina_id, data, hora, duracao_min, nome, telefone, placa, servico, observacao, consentimento)
  values (a.oficina_id, p_data, p_hora, (a.config ->> 'intervaloMin')::integer, v_nome, v_tel, v_placa, coalesce(v_servico, 'Serviço'), v_obs, true)
  returning id into v_id;

  -- os pedidos desta oficina saem 90 dias depois do dia pedido
  delete from public.agendamentos_online where oficina_id = a.oficina_id and data < v_agora::date - 90;

  return jsonb_build_object('id', v_id, 'data', to_char(p_data, 'YYYY-MM-DD'), 'hora', p_hora);
end;
$$;

revoke all on function public.agenda_ver(text), public.agenda_horarios(text, date, date),
  public.agenda_pedir(text, date, text, text, text, text, text, text, boolean, text) from public;
grant execute on function public.agenda_ver(text), public.agenda_horarios(text, date, date),
  public.agenda_pedir(text, date, text, text, text, text, text, text, boolean, text) to anon, authenticated;

-- tempo real: a oficina vê o pedido novo na hora
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agendamentos_online') then
    alter publication supabase_realtime add table public.agendamentos_online;
  end if;
exception when others then
  raise notice 'Tempo real indisponível para os pedidos de horário: %', sqlerrm;
end $$;

-- Cotas de uso por oficina (IA e voz), limites contra abuso guardados no banco, registro de
-- acesso exigido pelo Marco Civil (6 meses), aceite dos termos, links públicos (orçamento,
-- andamento do serviço, garantia) e a rotina diária que apaga o que passou do prazo.

-- ------------------------------------------------------------------ cotas por oficina

create table public.uso_mensal (
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  recurso text not null check (recurso in ('montagem', 'transcricao')),
  quantidade integer not null default 0 check (quantidade >= 0),
  primary key (oficina_id, mes, recurso)
);

alter table public.uso_mensal enable row level security;
revoke all on public.uso_mensal from anon, authenticated;
grant select on public.uso_mensal to authenticated;
create policy "Membros veem o uso" on public.uso_mensal for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe()));

/** O plano da oficina hoje: 'pro', 'teste' ou 'gratis'. */
create or replace function privado.plano_da_oficina(p_oficina uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.pro_ate >= (now() at time zone 'America/Sao_Paulo')::date then 'pro'
    when o.teste_ate >= (now() at time zone 'America/Sao_Paulo')::date then 'teste'
    else 'gratis' end
    from public.oficinas o where o.id = p_oficina;
$$;
revoke all on function privado.plano_da_oficina(uuid) from public, anon, authenticated;

create or replace function privado.limite_do_recurso(p_plano text, p_recurso text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_recurso
    when 'montagem' then case when p_plano in ('pro', 'teste') then 300 else 5 end
    when 'transcricao' then case when p_plano in ('pro', 'teste') then 1500 else 30 end
    else 0 end;
$$;

/**
 * Gasta a cota do mês (fuso de Brasília) antes de chamar a IA. Passou do limite do plano,
 * dá erro RV040 e não gasta nada. Quem chama: um membro da oficina ou o sistema (agente).
 */
create or replace function public.consumir_cota(p_oficina uuid, p_recurso text, p_quantidade integer default 1)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_plano text;
  v_limite integer;
  v_usado integer;
begin
  if privado.papel_na_oficina(p_oficina) is null and not privado.sistema_autorizado() then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if p_quantidade < 1 or p_quantidade > 10 then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  v_plano := privado.plano_da_oficina(p_oficina);
  if v_plano is null then
    raise exception 'Oficina não encontrada' using errcode = '42501';
  end if;
  v_limite := privado.limite_do_recurso(v_plano, p_recurso);
  insert into public.uso_mensal as u (oficina_id, mes, recurso, quantidade)
  values (p_oficina, v_mes, p_recurso, p_quantidade)
  on conflict (oficina_id, mes, recurso) do update set quantidade = u.quantidade + excluded.quantidade
  returning quantidade into v_usado;
  if v_usado > v_limite then
    raise exception 'Cota do mês acabou' using errcode = 'RV040', detail = jsonb_build_object('plano', v_plano, 'limite', v_limite)::text;
  end if;
  return jsonb_build_object('plano', v_plano, 'usado', v_usado, 'limite', v_limite);
end;
$$;

/** Devolve a cota quando a IA falhou (só o servidor, com a chave do sistema). */
create or replace function public.devolver_cota(p_oficina uuid, p_recurso text, p_quantidade integer default 1)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update public.uso_mensal set quantidade = greatest(quantidade - least(greatest(p_quantidade, 0), 10), 0)
   where oficina_id = p_oficina and recurso = p_recurso and mes = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  return found;
end;
$$;

revoke all on function public.consumir_cota(uuid, text, integer), public.devolver_cota(uuid, text, integer) from public;
grant execute on function public.consumir_cota(uuid, text, integer) to anon, authenticated;
grant execute on function public.devolver_cota(uuid, text, integer) to anon;

-- ------------------------------------------------------------------ limites contra abuso

create table privado.limites (
  chave text not null check (char_length(chave) <= 200),
  janela bigint not null,
  n integer not null default 0,
  expira timestamptz not null,
  primary key (chave, janela)
);
create index limites_expira_idx on privado.limites (expira);
alter table privado.limites enable row level security;
create policy "Ninguém pela API" on privado.limites as restrictive for all to public using (false) with check (false);
revoke all on privado.limites from public, anon, authenticated;

/**
 * Conta uma tentativa na janela de p_segundos e diz se ainda cabe em p_max. Vale para todos os
 * servidores ao mesmo tempo (antes era na memória de cada um). Só o servidor chama.
 */
create or replace function public.limite_consumir(p_chave text, p_max integer, p_segundos integer)
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
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  insert into privado.limites as l (chave, janela, n, expira)
  values (left(p_chave, 200), v_janela, 1, to_timestamp((v_janela + 1) * greatest(p_segundos, 1)))
  on conflict (chave, janela) do update set n = l.n + 1
  returning n into v_n;
  return v_n <= p_max;
end;
$$;

/** Só confere, sem contar (para limitar erros sem punir quem acerta). */
create or replace function public.limite_esgotado(p_chave text, p_max integer, p_segundos integer)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((select n from privado.limites where chave = left(p_chave, 200) and janela = floor(extract(epoch from now()) / greatest(p_segundos, 1))::bigint), 0) >= p_max;
end;
$$;

revoke all on function public.limite_consumir(text, integer, integer), public.limite_esgotado(text, integer, integer) from public, authenticated;
grant execute on function public.limite_consumir(text, integer, integer), public.limite_esgotado(text, integer, integer) to anon;

-- ------------------------------------------------------------------ registro de acesso (Marco Civil, art. 15)

create table privado.acessos (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  user_id uuid,
  ip text not null check (char_length(ip) <= 64),
  porta integer check (porta between 0 and 65535),
  rota text check (char_length(rota) <= 200),
  agente text check (char_length(agente) <= 300)
);
create index acessos_quando_idx on privado.acessos (quando);
create index acessos_user_idx on privado.acessos (user_id, quando);
create index acessos_ip_idx on privado.acessos (ip, quando);
alter table privado.acessos enable row level security;
create policy "Ninguém pela API" on privado.acessos as restrictive for all to public using (false) with check (false);
revoke all on privado.acessos from public, anon, authenticated;

comment on table privado.acessos is 'Data, hora, IP e porta de cada acesso, guardados em sigilo por 6 meses (Marco Civil da Internet, art. 15). Só sai com ordem judicial.';

create or replace function public.registrar_acesso(p_user uuid, p_ip text, p_porta integer, p_rota text, p_agente text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  insert into privado.acessos (user_id, ip, porta, rota, agente)
  values (p_user, left(coalesce(nullif(p_ip, ''), 'desconhecido'), 64), case when p_porta between 0 and 65535 then p_porta end, left(p_rota, 200), left(p_agente, 300));
  return true;
end;
$$;

/** Consulta para atender ordem judicial: só admin, e a própria consulta fica no histórico. */
create or replace function public.acessos_consultar(p_user uuid default null, p_ip text default null, p_de timestamptz default null, p_ate timestamptz default null, p_motivo text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
begin
  if not privado.eh_equipe(array['admin']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' or (p_user is null and coalesce(p_ip, '') = '') then
    raise exception 'Diga o motivo (número do processo) e quem procurar' using errcode = '22023';
  end if;
  insert into privado.auditoria (user_id, email, papel, acao, tabela, registro, depois)
  select auth.uid(), e.email, e.papel, 'consultou_acessos', 'privado.acessos', coalesce(p_user::text, p_ip),
         jsonb_build_object('motivo', left(p_motivo, 300), 'de', p_de, 'ate', p_ate)
    from privado.equipe e where e.user_id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('quando', a.quando, 'userId', a.user_id, 'ip', a.ip, 'porta', a.porta, 'rota', a.rota, 'agente', a.agente) order by a.quando), '[]'::jsonb)
    into v_res
    from (select * from privado.acessos x
           where (p_user is null or x.user_id = p_user) and (coalesce(p_ip, '') = '' or x.ip = p_ip)
             and (p_de is null or x.quando >= p_de) and (p_ate is null or x.quando <= p_ate)
           order by x.quando limit 5000) a;
  return v_res;
end;
$$;

revoke all on function public.registrar_acesso(uuid, text, integer, text, text), public.acessos_consultar(uuid, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.registrar_acesso(uuid, text, integer, text, text) to anon;
grant execute on function public.acessos_consultar(uuid, text, timestamptz, timestamptz, text) to authenticated;

-- ------------------------------------------------------------------ termos aceitos

create table public.aceites (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  documento text not null check (documento in ('termos', 'privacidade', 'contrato_loja', 'tratamento_dados')),
  versao text not null check (versao ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  aceito_em timestamptz not null default now(),
  ip text check (char_length(ip) <= 64),
  agente text check (char_length(agente) <= 300),
  unique (user_id, documento, versao)
);
alter table public.aceites enable row level security;
revoke all on public.aceites from anon, authenticated;
grant select on public.aceites to authenticated;
create policy "Cada um vê os próprios aceites" on public.aceites for select to authenticated
  using (user_id = auth.uid() or (select privado.eh_equipe()));

/** A versão atual de cada documento (mudar aqui pede o aceite de novo). */
create or replace function public.versoes_dos_termos()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"termos": "2026-10-17", "privacidade": "2026-10-17", "contrato_loja": "2026-10-17", "tratamento_dados": "2026-10-17"}'::jsonb;
$$;

create or replace function public.aceitar_termos(p_documentos text[], p_ip text default null, p_agente text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_doc text;
  v_n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  foreach v_doc in array p_documentos loop
    if public.versoes_dos_termos() ? v_doc then
      insert into public.aceites (user_id, documento, versao, ip, agente)
      values (auth.uid(), v_doc, public.versoes_dos_termos() ->> v_doc, left(p_ip, 64), left(p_agente, 300))
      on conflict (user_id, documento, versao) do nothing;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

/** Os documentos que a pessoa ainda precisa aceitar (na versão atual). */
create or replace function public.termos_pendentes()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(d.key order by d.key), '{}')
    from jsonb_each_text(public.versoes_dos_termos()) d
   where (d.key in ('termos', 'privacidade')
          or (d.key = 'contrato_loja' and exists (select 1 from public.fornecedor_membros m where m.user_id = auth.uid() and m.papel = 'dono'))
          or (d.key = 'tratamento_dados' and exists (select 1 from public.oficina_membros m where m.user_id = auth.uid() and m.papel = 'dono')))
     and not exists (select 1 from public.aceites a where a.user_id = auth.uid() and a.documento = d.key and a.versao = d.value);
$$;

revoke all on function public.aceitar_termos(text[], text, text), public.termos_pendentes() from public, anon;
grant execute on function public.aceitar_termos(text[], text, text), public.termos_pendentes() to authenticated;
grant execute on function public.versoes_dos_termos() to anon, authenticated;

-- ------------------------------------------------------------------ links públicos

/** Código curto para a pessoa digitar: sem 0, O, 1, I (não confunde). */
create or replace function privado.codigo_curto(p_tamanho integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(p_tamanho);
  v text := '';
begin
  for i in 0 .. p_tamanho - 1 loop
    v := v || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v;
end;
$$;
revoke all on function privado.codigo_curto(integer) from public, anon, authenticated;

create table public.links_publicos (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  tipo text not null check (tipo in ('orcamento', 'andamento', 'garantia', 'historico', 'checklist')),
  ref text not null check (char_length(ref) between 1 and 100),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  codigo text check (codigo ~ '^[A-Z0-9]{6}$'),
  placa text check (placa ~ '^[A-Z0-9]{7}$'),
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 200000),
  resposta jsonb,
  respondido_em timestamptz,
  processado_em timestamptz,
  vistas integer not null default 0,
  visto_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '90 days',
  revogado boolean not null default false,
  unique (oficina_id, tipo, ref)
);
create index links_publicos_placa_idx on public.links_publicos (placa, codigo) where tipo = 'garantia';
create index links_publicos_oficina_idx on public.links_publicos (oficina_id, atualizado_em desc);

alter table public.links_publicos enable row level security;
revoke all on public.links_publicos from anon, authenticated;
grant select on public.links_publicos to authenticated;
create policy "Membros veem os links da oficina" on public.links_publicos for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()));

/**
 * Publica (ou atualiza) o que o cliente da oficina vê pelo link. O código do link volta só na
 * criação (o banco guarda o hash); depois, a oficina guarda o código junto do orçamento/ordem.
 */
create or replace function public.publicar_link(p_oficina uuid, p_tipo text, p_ref text, p_dados jsonb, p_dias integer default 90, p_placa text default null, p_novo boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_codigo text;
  v_existe public.links_publicos%rowtype;
  v_placa text := nullif(upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g')), '');
begin
  if privado.papel_na_oficina(p_oficina) is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  -- cobrança do cliente e clube são dinheiro: só o dono e o gerente
  if p_tipo in ('pagamento', 'clube') and coalesce(privado.papel_na_oficina(p_oficina), '') not in ('dono', 'gerente') then
    raise exception 'Só o dono e o gerente cobram' using errcode = '42501';
  end if;
  if (select count(*) from public.links_publicos where oficina_id = p_oficina and criado_em > now() - interval '1 hour') >= 200 then
    raise exception 'Muitos links seguidos' using errcode = 'P0001';
  end if;
  select * into v_existe from public.links_publicos where oficina_id = p_oficina and tipo = p_tipo and ref = p_ref;
  if found and not p_novo and not v_existe.revogado then
    update public.links_publicos
       set dados = p_dados, atualizado_em = now(), placa = coalesce(v_placa, placa),
           expira_em = greatest(expira_em, now() + make_interval(days => least(greatest(p_dias, 1), 3650)))
     where id = v_existe.id;
    return jsonb_build_object('id', v_existe.id, 'token', null, 'codigo', v_existe.codigo);
  end if;
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_token := left(v_token, 43);
  v_codigo := privado.codigo_curto(6);
  insert into public.links_publicos (oficina_id, tipo, ref, token_hash, codigo, placa, dados, expira_em)
  values (p_oficina, p_tipo, p_ref, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_codigo, v_placa, p_dados,
          now() + make_interval(days => least(greatest(p_dias, 1), 3650)))
  on conflict (oficina_id, tipo, ref) do update
    set token_hash = excluded.token_hash, codigo = excluded.codigo, placa = excluded.placa, dados = excluded.dados,
        expira_em = excluded.expira_em, revogado = false, resposta = null, respondido_em = null, processado_em = null,
        atualizado_em = now(), vistas = 0, visto_em = null;
  return jsonb_build_object('token', v_token, 'codigo', v_codigo);
end;
$$;

create or replace function public.revogar_link(p_oficina uuid, p_tipo text, p_ref text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if privado.papel_na_oficina(p_oficina) is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if p_tipo in ('pagamento', 'clube') and coalesce(privado.papel_na_oficina(p_oficina), '') not in ('dono', 'gerente') then
    raise exception 'Só o dono e o gerente cobram' using errcode = '42501';
  end if;
  update public.links_publicos set revogado = true, atualizado_em = now() where oficina_id = p_oficina and tipo = p_tipo and ref = p_ref;
  return found;
end;
$$;

/** A oficina marca que já aplicou a resposta do cliente (aprovação do orçamento etc.). */
create or replace function public.link_processado(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.links_publicos set processado_em = now()
   where id = p_id and oficina_id in (select privado.minhas_oficinas());
  return found;
end;
$$;

/** O que o cliente vê pelo link (null se não vale mais). Conta a visita. */
create or replace function public.ver_link(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.links_publicos%rowtype;
  o public.oficinas%rowtype;
begin
  if p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;
  update public.links_publicos set vistas = vistas + 1, visto_em = now()
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and not revogado and expira_em > now()
   returning * into l;
  if not found then
    return null;
  end if;
  select * into o from public.oficinas where id = l.oficina_id;
  return jsonb_build_object(
    'tipo', l.tipo, 'dados', l.dados, 'codigo', l.codigo, 'resposta', l.resposta, 'respondidoEm', l.respondido_em,
    'atualizadoEm', l.atualizado_em, 'expiraEm', l.expira_em,
    'oficina', jsonb_build_object('nome', o.nome, 'whatsapp', o.whatsapp, 'cidade', o.cidade, 'uf', o.uf, 'endereco', o.endereco, 'linkAvaliacao', o.link_avaliacao)
  );
end;
$$;

/**
 * O cliente responde pelo link: aprova ou recusa o orçamento (com os itens recusados), assina
 * o checklist. Guarda data, hora, IP, aparelho e o que foi mostrado (versão), como prova.
 */
create or replace function public.responder_link(p_token text, p_resposta jsonb, p_ip text default null, p_agente text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.links_publicos%rowtype;
  v_acao text := coalesce(p_resposta ->> 'acao', '');
begin
  if p_token !~ '^[A-Za-z0-9_-]{43}$' or jsonb_typeof(p_resposta) is distinct from 'object' or pg_column_size(p_resposta) > 120000 then
    raise exception 'Resposta inválida' using errcode = '22023';
  end if;
  select * into l from public.links_publicos
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and not revogado and expira_em > now()
   for update;
  if not found then
    raise exception 'O link não vale mais' using errcode = 'RV050';
  end if;
  if l.tipo = 'orcamento' and v_acao not in ('aprovar', 'recusar') then
    raise exception 'Resposta inválida' using errcode = '22023';
  end if;
  if l.tipo = 'checklist' and v_acao <> 'assinar' then
    raise exception 'Resposta inválida' using errcode = '22023';
  end if;
  if l.tipo not in ('orcamento', 'checklist') then
    raise exception 'Este link não recebe resposta' using errcode = '22023';
  end if;
  if l.respondido_em is not null then
    raise exception 'Já respondido' using errcode = 'RV051';
  end if;
  update public.links_publicos
     set resposta = p_resposta || jsonb_build_object(
           'quando', now(), 'ip', left(p_ip, 64), 'agente', left(p_agente, 300),
           'versao', l.atualizado_em, 'hashDoQueViu', encode(sha256(convert_to(l.dados::text, 'UTF8')), 'hex')),
         respondido_em = now()
   where id = l.id;
  return jsonb_build_object('ok', true, 'quando', now());
end;
$$;

/** A garantia do serviço pela placa e pelo código impresso no certificado. */
create or replace function public.garantia_consultar(p_placa text, p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_placa text := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  return (
    select jsonb_build_object('dados', l.dados, 'oficina', jsonb_build_object('nome', o.nome, 'whatsapp', o.whatsapp, 'cidade', o.cidade, 'uf', o.uf), 'atualizadoEm', l.atualizado_em)
      from public.links_publicos l join public.oficinas o on o.id = l.oficina_id
     where l.tipo = 'garantia' and l.placa = v_placa and l.codigo = upper(trim(p_codigo)) and not l.revogado and l.expira_em > now()
     limit 1
  );
end;
$$;

revoke all on function public.publicar_link(uuid, text, text, jsonb, integer, text, boolean), public.revogar_link(uuid, text, text), public.link_processado(uuid),
  public.ver_link(text), public.responder_link(text, jsonb, text, text), public.garantia_consultar(text, text) from public;
grant execute on function public.publicar_link(uuid, text, text, jsonb, integer, text, boolean), public.revogar_link(uuid, text, text), public.link_processado(uuid) to authenticated;
grant execute on function public.ver_link(text), public.responder_link(text, jsonb, text, text), public.garantia_consultar(text, text) to anon, authenticated;

-- fotos que a oficina mostra no link (andamento e checklist): caminho com o id da oficina e
-- um nome aleatório, num bucket público só de leitura
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('links', 'links', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "Oficina guarda fotos dos links" on storage.objects for insert to authenticated
  with check (bucket_id = 'links' and (storage.foldername(name))[1] in (select privado.minhas_oficinas()::text));
create policy "Oficina apaga fotos dos links" on storage.objects for delete to authenticated
  using (bucket_id = 'links' and (storage.foldername(name))[1] in (select privado.minhas_oficinas()::text));
create policy "Oficina vê as fotos dos links" on storage.objects for select to authenticated
  using (bucket_id = 'links' and (storage.foldername(name))[1] in (select privado.minhas_oficinas()::text));

-- ------------------------------------------------------------------ exclusão da conta e titulares

alter table public.oficinas add column if not exists excluir_em timestamptz;

/** O dono pede para apagar a oficina: some dos acessos na hora e é apagada em 30 dias. */
create or replace function public.oficina_pedir_exclusao(p_oficina uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quando timestamptz := now() + interval '30 days';
begin
  if coalesce(privado.papel_na_oficina(p_oficina), '') <> 'dono' then
    raise exception 'Só o dono apaga a oficina' using errcode = '42501';
  end if;
  update public.oficinas set excluir_em = v_quando, ativa = false where id = p_oficina;
  return v_quando;
end;
$$;

create or replace function public.oficina_cancelar_exclusao(p_oficina uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(privado.papel_na_oficina(p_oficina), '') <> 'dono' then
    raise exception 'Só o dono' using errcode = '42501';
  end if;
  update public.oficinas set excluir_em = null, ativa = true where id = p_oficina and excluir_em > now();
  return found;
end;
$$;

/** Tudo o que o Revisaí guarda sobre um e-mail (pedido de titular, LGPD art. 18). */
create or replace function public.titular_exportar(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
begin
  if not privado.eh_equipe(array['suporte']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  insert into privado.auditoria (user_id, email, papel, acao, tabela, registro)
  select auth.uid(), e.email, e.papel, 'exportou_titular', 'auth.users', v_email from privado.equipe e where e.user_id = auth.uid();
  return jsonb_build_object(
    'email', v_email,
    'conta', (select jsonb_build_object('id', u.id, 'criadaEm', u.created_at, 'ultimoAcesso', u.last_sign_in_at) from auth.users u where u.id = v_user),
    'oficinas', coalesce((select jsonb_agg(jsonb_build_object('oficina', o.nome, 'papel', m.papel, 'desde', m.criado_em)) from public.oficina_membros m join public.oficinas o on o.id = m.oficina_id where m.user_id = v_user), '[]'::jsonb),
    'lojas', coalesce((select jsonb_agg(jsonb_build_object('loja', f.nome, 'papel', m.papel, 'desde', m.criado_em)) from public.fornecedor_membros m join public.fornecedores f on f.id = m.fornecedor_id where m.user_id = v_user), '[]'::jsonb),
    'cadastros', coalesce((select jsonb_agg(to_jsonb(i) - 'id') from public.interessados i where lower(i.email) = v_email), '[]'::jsonb),
    'aceites', coalesce((select jsonb_agg(jsonb_build_object('documento', a.documento, 'versao', a.versao, 'em', a.aceito_em)) from public.aceites a where a.user_id = v_user), '[]'::jsonb),
    -- os IPs de acesso ficam em sigilo (Marco Civil): só o admin, pela consulta com motivo
    'acessos', jsonb_build_object('quantidade', (select count(*) from privado.acessos where user_id = v_user),
                                  'aviso', 'Os registros de acesso (data, hora e IP) só saem por pedido formal, pela consulta da equipe com o motivo.')
  );
end;
$$;

/** Apaga o que é da pessoa (cadastros do site e a conta). Oficina ou loja em que ela é a única dona fica para a exclusão da empresa. */
create or replace function public.titular_apagar(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
  v_cad integer;
begin
  if not privado.eh_equipe(array['suporte']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  -- alguém da equipe só sai pela mão de um admin
  if v_user is not null and exists (select 1 from privado.equipe e where e.user_id = v_user) and not privado.eh_equipe(array['admin']) then
    raise exception 'Só um admin apaga alguém da equipe' using errcode = '42501';
  end if;
  if v_user is not null and (
       exists (select 1 from public.oficina_membros m where m.user_id = v_user and m.papel = 'dono'
                 and (select count(*) from public.oficina_membros x where x.oficina_id = m.oficina_id and x.papel = 'dono') = 1)
    or exists (select 1 from public.fornecedor_membros m where m.user_id = v_user and m.papel = 'dono'
                 and (select count(*) from public.fornecedor_membros x where x.fornecedor_id = m.fornecedor_id and x.papel = 'dono') = 1)) then
    raise exception 'A pessoa é a única dona de uma oficina ou loja: apague a empresa primeiro' using errcode = 'P0001';
  end if;
  delete from public.interessados where lower(email) = v_email;
  get diagnostics v_cad = row_count;
  if v_user is not null then
    delete from auth.users where id = v_user;
  end if;
  insert into privado.auditoria (user_id, email, papel, acao, tabela, registro, depois)
  select auth.uid(), e.email, e.papel, 'apagou_titular', 'auth.users', v_email, jsonb_build_object('cadastros', v_cad, 'conta', v_user is not null)
    from privado.equipe e where e.user_id = auth.uid();
  return jsonb_build_object('cadastros', v_cad, 'conta', v_user is not null);
end;
$$;

revoke all on function public.oficina_pedir_exclusao(uuid), public.oficina_cancelar_exclusao(uuid), public.titular_exportar(text), public.titular_apagar(text) from public, anon;
grant execute on function public.oficina_pedir_exclusao(uuid), public.oficina_cancelar_exclusao(uuid), public.titular_exportar(text), public.titular_apagar(text) to authenticated;

-- ------------------------------------------------------------------ rotina diária

/**
 * O que vence todo dia: trocas de Pix depois de 24 horas, Destaque e impulsos que acabaram,
 * limites e acessos velhos (acessos ficam 6 meses), links vencidos, marcas de apagado antigas,
 * oficinas com exclusão pedida há 30 dias, cadastros do site parados há 2 anos.
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
  r := r || jsonb_build_object('pix', privado.aplicar_trocas_pix(null));

  update public.fornecedores set destaque = false where destaque and destaque_ate is not null and destaque_ate < v_hoje;
  get diagnostics n = row_count; r := r || jsonb_build_object('destaques', n);
  update public.fornecedores_contrato c set plano = 'vitrine', atualizado_em = now()
   where c.plano = 'destaque' and exists (select 1 from public.fornecedores f where f.id = c.fornecedor_id and not f.destaque);
  update public.impulsos set status = 'encerrado', atualizado_em = now() where status = 'ativo' and fim < v_hoje;
  get diagnostics n = row_count; r := r || jsonb_build_object('impulsos', n);

  delete from privado.limites where expira < now() - interval '1 day';
  delete from privado.acessos where quando < now() - interval '6 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('acessos', n);
  delete from public.links_publicos where expira_em < now() - interval '30 days';
  delete from public.registros where apagado and atualizado_em < now() - interval '180 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('apagados', n);
  delete from public.oficinas where excluir_em is not null and excluir_em < now();
  get diagnostics n = row_count; r := r || jsonb_build_object('oficinas', n);
  delete from public.interessados where criado_em < now() - interval '2 years' and situacao <> 'novo';
  delete from public.whatsapp_codigos where expira_em < now();
  delete from public.convites where aceito_em is null and expira_em < now() - interval '30 days';
  delete from privado.auditoria where quando < now() - interval '5 years';
  return r;
end;
$$;

revoke all on function public.rotina_diaria() from public, authenticated;
grant execute on function public.rotina_diaria() to anon;

-- tempo real: a oficina escuta as respostas dos links
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.links_publicos;
  end if;
end $$;

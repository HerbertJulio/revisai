-- Avisos para fora do app (Web Push, e-mail e WhatsApp), por uma fila no banco: cada evento
-- que importa (pedido novo, resposta de alerta, orçamento aprovado...) vira uma linha na fila,
-- um gatilho acorda o servidor (pg_net, quando existe) e o servidor manda pelos canais que a
-- pessoa deixou ligados. A rotina diária é a reserva para o que ficou para trás.
-- Também: as inscrições de Web Push, as chaves VAPID, as preferências de cada pessoa e os
-- erros que os navegadores relatam (sem dados pessoais, guardados 30 dias).
-- Pode rodar de novo sem estragar nada (if not exists, create or replace).

-- ------------------------------------------------------------------ configuração

create table if not exists privado.avisos_config (
  id boolean primary key default true check (id),
  app_url text check (app_url ~ '^https?://[^/]+$'),
  token text check (char_length(token) between 32 and 200),
  atualizado_em timestamptz not null default now()
);
alter table privado.avisos_config enable row level security;
drop policy if exists "Ninguém pela API" on privado.avisos_config;
create policy "Ninguém pela API" on privado.avisos_config as restrictive for all to public using (false) with check (false);
revoke all on privado.avisos_config from public, anon, authenticated;

comment on table privado.avisos_config is 'Endereço do app e o código que o banco manda ao acordar o processador de avisos. Configure com: select privado.avisos_configurar(''https://revisai.howlks.com'');';

/**
 * Liga o acordar do processador: guarda o endereço do app e gera um código novo (troca o antigo).
 * Rodar uma vez no SQL do Supabase, como dono do banco.
 */
create or replace function privado.avisos_configurar(p_app_url text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
begin
  insert into privado.avisos_config (id, app_url, token, atualizado_em)
  values (true, rtrim(p_app_url, '/'), v_token, now())
  on conflict (id) do update set app_url = excluded.app_url, token = excluded.token, atualizado_em = now();
  return 'ok';
end;
$$;
revoke all on function privado.avisos_configurar(text) from public, anon, authenticated;

/** O servidor confere o código que chegou no cabeçalho x-revisai-avisos (só com a chave do sistema). */
create or replace function public.avisos_ping_confere(p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select token into v_token from privado.avisos_config where id;
  return v_token is not null and p_token is not null
     and encode(sha256(convert_to(v_token, 'UTF8')), 'hex') = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
end;
$$;
revoke all on function public.avisos_ping_confere(text) from public, authenticated;
grant execute on function public.avisos_ping_confere(text) to anon;

-- pg_net (Supabase): o gatilho chama o processador sem esperar a resposta. Sem ele (testes
-- locais), os avisos ficam na fila até o servidor ou a rotina diária buscarem.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net indisponível: os avisos esperam o processador ser chamado';
end $$;

-- ------------------------------------------------------------------ fila

create table if not exists public.avisos_fila (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('pedido_novo', 'pedido_situacao', 'alerta_novo', 'alerta_resposta', 'pagamento_informado', 'link_resposta', 'suporte_resposta')),
  destino jsonb not null check (jsonb_typeof(destino) = 'object'),
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object'),
  criado_em timestamptz not null default now(),
  tentativas integer not null default 0 check (tentativas between 0 and 10),
  proxima_em timestamptz not null default now(),
  reservado_ate timestamptz,
  enviado_em timestamptz,
  erro text check (char_length(erro) <= 500)
);
create index if not exists avisos_fila_pendentes_idx on public.avisos_fila (proxima_em, id) where enviado_em is null;
create index if not exists avisos_fila_criado_idx on public.avisos_fila (criado_em);

comment on table public.avisos_fila is 'Avisos esperando sair (push, e-mail, WhatsApp). Só o banco e o servidor mexem.';

alter table public.avisos_fila enable row level security;
drop policy if exists "Ninguém pela API" on public.avisos_fila;
create policy "Ninguém pela API" on public.avisos_fila as restrictive for all to public using (false) with check (false);
revoke all on public.avisos_fila from public, anon, authenticated;

-- ------------------------------------------------------------------ preferências

create table if not exists public.avisos_preferencias (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  push boolean not null default true,
  email boolean not null default true,
  whatsapp boolean not null default true,
  -- tipos de aviso que a pessoa não quer receber
  desligados text[] not null default '{}' check (desligados <@ array['pedido_novo', 'pedido_situacao', 'alerta_novo', 'alerta_resposta', 'pagamento_informado', 'link_resposta', 'suporte_resposta']::text[]),
  atualizado_em timestamptz not null default now()
);
alter table public.avisos_preferencias enable row level security;
revoke all on public.avisos_preferencias from public, anon, authenticated;
grant select, insert, update on public.avisos_preferencias to authenticated;
drop policy if exists "Cada um vê as próprias preferências" on public.avisos_preferencias;
drop policy if exists "Cada um grava as próprias preferências" on public.avisos_preferencias;
drop policy if exists "Cada um muda as próprias preferências" on public.avisos_preferencias;
create policy "Cada um vê as próprias preferências" on public.avisos_preferencias for select to authenticated
  using (user_id = auth.uid());
create policy "Cada um grava as próprias preferências" on public.avisos_preferencias for insert to authenticated
  with check (user_id = auth.uid());
create policy "Cada um muda as próprias preferências" on public.avisos_preferencias for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------------ Web Push

create table if not exists public.push_inscricoes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https?://' and char_length(endpoint) <= 1000),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{40,200}={0,2}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{8,64}={0,2}$'),
  agente text check (char_length(agente) <= 300),
  criado_em timestamptz not null default now(),
  ultimo_ok_em timestamptz
);
create index if not exists push_inscricoes_user_idx on public.push_inscricoes (user_id);

alter table public.push_inscricoes enable row level security;
revoke all on public.push_inscricoes from public, anon, authenticated;
grant select on public.push_inscricoes to authenticated;
drop policy if exists "Cada um vê os próprios aparelhos" on public.push_inscricoes;
create policy "Cada um vê os próprios aparelhos" on public.push_inscricoes for select to authenticated
  using (user_id = auth.uid());

/**
 * Inscreve este navegador para receber avisos. O mesmo navegador usado por outra conta antes
 * passa para quem está entrando agora (o endereço do push é do navegador, não da pessoa).
 */
create or replace function public.push_inscrever(p_endpoint text, p_p256dh text, p_auth text, p_agente text default null)
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
  -- no máximo 20 navegadores por pessoa: o mais parado sai para o novo entrar
  if not exists (select 1 from public.push_inscricoes where endpoint = p_endpoint and user_id = v_uid)
     and (select count(*) from public.push_inscricoes where user_id = v_uid) >= 20 then
    delete from public.push_inscricoes where id in (select id from public.push_inscricoes where user_id = v_uid order by coalesce(ultimo_ok_em, criado_em), id limit 1);
  end if;
  delete from public.push_inscricoes where endpoint = p_endpoint and user_id <> v_uid;
  insert into public.push_inscricoes (user_id, endpoint, p256dh, auth, agente)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_agente, 300))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, agente = excluded.agente;
  return true;
end;
$$;

create or replace function public.push_cancelar(p_endpoint text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.push_inscricoes where endpoint = p_endpoint and user_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.push_inscrever(text, text, text, text), public.push_cancelar(text) from public, anon;
grant execute on function public.push_inscrever(text, text, text, text), public.push_cancelar(text) to authenticated;

-- As chaves VAPID do Revisaí: geradas pelo servidor no primeiro uso e guardadas aqui.
create table if not exists privado.vapid (
  id boolean primary key default true check (id),
  publica text not null check (publica ~ '^[A-Za-z0-9_-]{80,100}$'),
  privada text not null check (privada ~ '^[A-Za-z0-9_-]{40,50}$'),
  criado_em timestamptz not null default now()
);
alter table privado.vapid enable row level security;
drop policy if exists "Ninguém pela API" on privado.vapid;
create policy "Ninguém pela API" on privado.vapid as restrictive for all to public using (false) with check (false);
revoke all on privado.vapid from public, anon, authenticated;

create or replace function public.vapid_obter()
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
  return (select jsonb_build_object('publica', publica, 'privada', privada) from privado.vapid where id);
end;
$$;

/** Guarda o par gerado pelo servidor; se outro servidor guardou antes, vale o primeiro. */
create or replace function public.vapid_guardar(p_publica text, p_privada text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  insert into privado.vapid (id, publica, privada) values (true, p_publica, p_privada) on conflict (id) do nothing;
  return (select jsonb_build_object('publica', publica, 'privada', privada) from privado.vapid where id);
end;
$$;

revoke all on function public.vapid_obter(), public.vapid_guardar(text, text) from public, authenticated;
grant execute on function public.vapid_obter(), public.vapid_guardar(text, text) to anon;

-- ------------------------------------------------------------------ pôr na fila e acordar

/** Põe um aviso na fila. Só gatilhos do banco chamam. */
create or replace function privado.avisar(p_tipo text, p_destino jsonb, p_dados jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.avisos_fila (tipo, destino, dados) values (p_tipo, p_destino, coalesce(p_dados, '{}'::jsonb));
end;
$$;
revoke all on function privado.avisar(text, jsonb, jsonb) from public, anon, authenticated;

/** Acorda o processador uma vez por comando (não por linha), quando o pg_net existe e está configurado. */
create or replace function privado.avisos_acordar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c privado.avisos_config%rowtype;
begin
  select * into c from privado.avisos_config where id;
  if c.app_url is null or c.token is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return null;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
      using c.app_url || '/api/avisos/processar', '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-revisai-avisos', c.token);
  exception when others then
    -- sem acordar, o aviso espera o próximo ou a rotina diária
    null;
  end;
  return null;
end;
$$;

create or replace trigger avisos_fila_acordar after insert on public.avisos_fila
  for each statement execute function privado.avisos_acordar();

-- ------------------------------------------------------------------ eventos

-- pedido novo para a loja e mudança de situação e pagamento informado
create or replace function privado.avisos_da_parte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loja text;
  v_itens integer := coalesce(jsonb_array_length(case when jsonb_typeof(new.itens) = 'array' then new.itens end), 0);
begin
  if tg_op = 'INSERT' then
    perform privado.avisar('pedido_novo', jsonb_build_object('fornecedor_id', new.fornecedor_id),
      jsonb_build_object('parteId', new.id, 'codigo', new.codigo, 'subtotal', new.subtotal, 'itens', v_itens, 'cidade', new.oficina_cidade));
    return null;
  end if;
  if new.status is distinct from old.status and new.status in ('confirmado', 'saiu_entrega', 'entregue', 'cancelado') and new.oficina_id is not null then
    select nome into v_loja from public.fornecedores where id = new.fornecedor_id;
    perform privado.avisar('pedido_situacao', jsonb_build_object('oficina_id', new.oficina_id),
      jsonb_build_object('parteId', new.id, 'codigo', new.codigo, 'loja', v_loja, 'status', new.status, 'previsao', new.entrega_previsao,
        'motivo', case when new.status = 'cancelado' then new.cancelado_motivo end, 'subtotal', new.subtotal));
  end if;
  if new.pagamento is distinct from old.pagamento and new.pagamento = 'informado' then
    perform privado.avisar('pagamento_informado', jsonb_build_object('fornecedor_id', new.fornecedor_id),
      jsonb_build_object('parteId', new.id, 'codigo', new.codigo, 'subtotal', new.subtotal));
  end if;
  return null;
end;
$$;

create or replace trigger avisos_parte_nova after insert on public.pedidos_fornecedores
  for each row execute function privado.avisos_da_parte();
create or replace trigger avisos_parte_mudou after update of status, pagamento on public.pedidos_fornecedores
  for each row execute function privado.avisos_da_parte();

-- alerta de preço novo para as lojas do estado que vendem a categoria
create or replace function privado.avisos_do_alerta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'aberto' then
    perform privado.avisar('alerta_novo', jsonb_build_object('uf', new.oficina_uf, 'categoria', new.categoria),
      jsonb_build_object('alertaId', new.id, 'titulo', new.titulo, 'quantidade', new.quantidade, 'precoAlvo', new.preco_alvo,
        'cidade', new.oficina_cidade, 'expiraEm', new.expira_em));
  end if;
  return null;
end;
$$;

create or replace trigger avisos_alerta_novo after insert on public.alertas_preco
  for each row execute function privado.avisos_do_alerta();

-- resposta de loja (aceite ou contraproposta) para a oficina do alerta
create or replace function privado.avisos_da_resposta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_oficina uuid;
  v_loja text;
begin
  if new.tipo = 'recusa' then
    return null;
  end if;
  select titulo, oficina_id into v_titulo, v_oficina from public.alertas_preco where id = new.alerta_id;
  v_oficina := coalesce(new.oficina_id, v_oficina);
  if v_oficina is null then
    return null;
  end if;
  select nome into v_loja from public.fornecedores where id = new.fornecedor_id;
  perform privado.avisar('alerta_resposta', jsonb_build_object('oficina_id', v_oficina),
    jsonb_build_object('alertaId', new.alerta_id, 'titulo', v_titulo, 'loja', v_loja, 'tipo', new.tipo, 'preco', new.preco, 'minimo', new.quantidade_minima));
  return null;
end;
$$;

create or replace trigger avisos_resposta_nova after insert on public.alertas_respostas
  for each row execute function privado.avisos_da_resposta();

-- o cliente respondeu pelo link (aprovou ou recusou o orçamento, assinou o checklist)
create or replace function privado.avisos_do_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.respondido_em is null and new.respondido_em is not null then
    perform privado.avisar('link_resposta', jsonb_build_object('oficina_id', new.oficina_id),
      jsonb_build_object('linkId', new.id, 'tipoLink', new.tipo, 'ref', new.ref, 'acao', new.resposta ->> 'acao',
        'titulo', coalesce(new.dados ->> 'titulo', new.dados ->> 'carro', new.dados ->> 'numero'),
        'cliente', coalesce(new.dados ->> 'cliente', new.resposta ->> 'nome')));
  end if;
  return null;
end;
$$;

create or replace trigger avisos_link_respondido after update of respondido_em on public.links_publicos
  for each row execute function privado.avisos_do_link();

-- a equipe respondeu um pedido de ajuda
create or replace function privado.avisos_do_suporte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.suporte_chamados%rowtype;
begin
  if new.autor <> 'equipe' then
    return null;
  end if;
  select * into c from public.suporte_chamados where id = new.chamado_id;
  if not found or (c.user_id is null and c.email is null) then
    return null;
  end if;
  perform privado.avisar('suporte_resposta', jsonb_build_object('user_id', c.user_id, 'email', c.email),
    jsonb_build_object('chamadoId', c.id, 'assunto', c.assunto, 'trecho', left(new.texto, 160),
      'area', case when c.oficina_id is not null then 'oficina' when c.fornecedor_id is not null then 'loja' else 'conta' end));
  return null;
end;
$$;

create or replace trigger avisos_suporte_respondido after insert on public.suporte_mensagens
  for each row execute function privado.avisos_do_suporte();

-- ------------------------------------------------------------------ quem recebe

/**
 * As pessoas de um destino, com o que cada uma deixou ligado e os navegadores inscritos.
 * {fornecedor_id} = membros da loja; {oficina_id} = membros da oficina; {uf, categoria} =
 * membros das lojas no ar do estado que vendem a categoria (no máximo 20, as com mais produtos
 * da categoria primeiro); {user_id, email} = a pessoa.
 */
create or replace function privado.avisos_destinatarios(p_tipo text, p_destino jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lojas bigint[] := '{}';
  v_oficina uuid := case when p_destino ? 'oficina_id' then (p_destino ->> 'oficina_id')::uuid end;
  v_pessoas jsonb;
  v_whatsapps jsonb;
begin
  if p_destino ? 'fornecedor_id' then
    v_lojas := array[(p_destino ->> 'fornecedor_id')::bigint];
  elsif p_destino ? 'uf' and p_destino ? 'categoria' then
    select coalesce(array_agg(x.id order by x.n desc, x.id), '{}') into v_lojas
      from (
        select f.id, q.n
          from public.fornecedores f
          cross join lateral (select count(*) as n from public.produtos p where p.fornecedor_id = f.id and p.ativo and p.categoria = p_destino ->> 'categoria') q
         where f.ativo and not f.demonstracao and f.uf = p_destino ->> 'uf' and q.n > 0
         order by q.n desc, f.id
         limit 20
      ) x;
  end if;

  with membros as (
    select m.user_id, lower(coalesce(nullif(m.email, ''), u.email)) as email
      from public.fornecedor_membros m left join auth.users u on u.id = m.user_id
     where m.fornecedor_id = any (v_lojas)
    union
    select m.user_id, lower(coalesce(nullif(m.email, ''), u.email))
      from public.oficina_membros m left join auth.users u on u.id = m.user_id
     where m.oficina_id = v_oficina
    union
    select u.id, lower(coalesce(u.email, p_destino ->> 'email'))
      from auth.users u
     where p_destino ? 'user_id' and u.id = (p_destino ->> 'user_id')::uuid
    union
    select null::uuid, lower(p_destino ->> 'email')
     where p_destino ? 'email' and (p_destino ->> 'user_id') is null and coalesce(p_destino ->> 'email', '') <> ''
  ),
  unicos as (
    select distinct on (coalesce(user_id::text, email)) user_id, email from membros
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'userId', x.user_id,
      'email', x.email,
      'push', coalesce(p.push, true) and not (p_tipo = any (coalesce(p.desligados, '{}'))),
      'emailLigado', coalesce(p.email, true) and not (p_tipo = any (coalesce(p.desligados, '{}'))),
      'whatsapp', coalesce(p.whatsapp, true) and not (p_tipo = any (coalesce(p.desligados, '{}'))),
      'inscricoes', coalesce((select jsonb_agg(jsonb_build_object('endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth)) from public.push_inscricoes i where i.user_id = x.user_id), '[]'::jsonb)
    )), '[]'::jsonb)
    into v_pessoas
    from unicos x left join public.avisos_preferencias p on p.user_id = x.user_id;

  -- O WhatsApp é da empresa (um número por loja ou oficina). Vai quando alguém da empresa deixou
  -- o WhatsApp ligado para este tipo de aviso (ou quando a empresa ainda não tem ninguém com
  -- conta). A loja também desliga em Sua loja (fornecedores.avisar_whatsapp, quando existe).
  -- Só para número conferido: a loja aprovada pela equipe, e a oficina cujo número já mandou o
  -- código para o agente do Revisaí (senão qualquer conta faria o Revisaí mandar mensagem para
  -- o número de outra pessoa).
  select coalesce(jsonb_agg(distinct w.whatsapp), '[]'::jsonb) into v_whatsapps
    from (
      select f.whatsapp from public.fornecedores f
       where f.id = any (v_lojas) and f.whatsapp is not null
         and f.ativo and f.verificacao = 'aprovada'
         and coalesce((to_jsonb(f) ->> 'avisar_whatsapp')::boolean, true)
         and (not exists (select 1 from public.fornecedor_membros m where m.fornecedor_id = f.id)
              or exists (select 1 from public.fornecedor_membros m left join public.avisos_preferencias p on p.user_id = m.user_id
                          where m.fornecedor_id = f.id and coalesce(p.whatsapp, true) and not (p_tipo = any (coalesce(p.desligados, '{}')))))
      union
      select o.whatsapp from public.oficinas o
       where o.id = v_oficina and o.whatsapp is not null
         and exists (select 1 from public.whatsapp_vinculos v
                      where v.oficina_id = o.id
                        and v.telefone in (regexp_replace(o.whatsapp, '[^0-9]', '', 'g'), '55' || regexp_replace(o.whatsapp, '[^0-9]', '', 'g')))
         and (not exists (select 1 from public.oficina_membros m where m.oficina_id = o.id)
              or exists (select 1 from public.oficina_membros m left join public.avisos_preferencias p on p.user_id = m.user_id
                          where m.oficina_id = o.id and coalesce(p.whatsapp, true) and not (p_tipo = any (coalesce(p.desligados, '{}')))))
    ) w;

  return jsonb_build_object('pessoas', v_pessoas, 'whatsapps', v_whatsapps);
end;
$$;
revoke all on function privado.avisos_destinatarios(text, jsonb) from public, anon, authenticated;

/**
 * O processador pega um lote (sem pegar o que outro servidor já pegou) e recebe, com cada aviso,
 * quem recebe e por onde. A reserva dura 2 minutos: se o servidor cair, outro pega depois.
 */
create or replace function public.avisos_reservar(p_limite integer default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  with lote as (
    select id from public.avisos_fila
     where enviado_em is null and tentativas < 5 and proxima_em <= now()
       and (reservado_ate is null or reservado_ate < now())
     order by id
     limit least(greatest(coalesce(p_limite, 50), 1), 200)
     for update skip locked
  ),
  marcados as (
    update public.avisos_fila f
       set reservado_ate = now() + interval '2 minutes', tentativas = f.tentativas + 1
      from lote
     where f.id = lote.id
    returning f.id, f.tipo, f.destino, f.dados, f.tentativas, f.criado_em
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'tipo', m.tipo, 'dados', m.dados, 'tentativas', m.tentativas, 'criadoEm', m.criado_em,
           'para', privado.avisos_destinatarios(m.tipo, m.destino)) order by m.id), '[]'::jsonb)
    into v_res
    from marcados m;
  return v_res;
end;
$$;

/**
 * O resultado de um aviso. Deu certo: fica marcado como enviado. Falhou: volta para a fila com
 * espera crescente (2, 4, 8, 16 minutos), até 5 tentativas. Os navegadores que o serviço de push
 * disse que não existem mais saem da lista; os que receberam ganham a data.
 */
create or replace function public.avisos_concluir(p_id bigint, p_ok boolean, p_erro text default null, p_push_invalidos text[] default '{}', p_push_ok text[] default '{}')
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
  if coalesce(array_length(p_push_invalidos, 1), 0) > 0 then
    delete from public.push_inscricoes where endpoint = any (p_push_invalidos);
  end if;
  if coalesce(array_length(p_push_ok, 1), 0) > 0 then
    update public.push_inscricoes set ultimo_ok_em = now() where endpoint = any (p_push_ok);
  end if;
  if p_ok then
    update public.avisos_fila set enviado_em = now(), reservado_ate = null, erro = left(p_erro, 500) where id = p_id;
  else
    update public.avisos_fila
       set reservado_ate = null, erro = left(coalesce(p_erro, 'falhou'), 500),
           proxima_em = now() + make_interval(mins => power(2, least(tentativas, 6))::integer)
     where id = p_id;
  end if;
  return found;
end;
$$;

revoke all on function public.avisos_reservar(integer), public.avisos_concluir(bigint, boolean, text, text[], text[]) from public, authenticated;
grant execute on function public.avisos_reservar(integer), public.avisos_concluir(bigint, boolean, text, text[], text[]) to anon;

-- ------------------------------------------------------------------ erros dos navegadores

create table if not exists privado.erros (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  rota text check (char_length(rota) <= 200),
  mensagem text not null check (char_length(mensagem) <= 500),
  pilha text check (char_length(pilha) <= 4000),
  origem text check (origem in ('janela', 'promessa', 'tela', 'servidor')),
  agente text check (char_length(agente) <= 200),
  versao text check (char_length(versao) <= 60),
  repeticoes integer not null default 1,
  assinatura text not null check (assinatura ~ '^[0-9a-f]{32}$')
);
create index if not exists erros_quando_idx on privado.erros (quando desc);
create unique index if not exists erros_assinatura_dia_idx on privado.erros (assinatura, (date_trunc('day', quando at time zone 'UTC')));
alter table privado.erros enable row level security;
drop policy if exists "Ninguém pela API" on privado.erros;
create policy "Ninguém pela API" on privado.erros as restrictive for all to public using (false) with check (false);
revoke all on privado.erros from public, anon, authenticated;

comment on table privado.erros is 'Erros que os navegadores relataram, sem dados pessoais (sem endereço completo, e-mail ou números longos). Guardados 30 dias.';

/** O servidor grava o erro (o mesmo erro no mesmo dia só conta mais uma vez). */
create or replace function public.erros_registrar(p_rota text, p_mensagem text, p_pilha text, p_origem text, p_agente text, p_versao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_assinatura text := md5(coalesce(p_mensagem, '') || '|' || coalesce(left(p_pilha, 300), '') || '|' || coalesce(p_rota, ''));
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  insert into privado.erros (rota, mensagem, pilha, origem, agente, versao, assinatura)
  values (left(p_rota, 200), left(coalesce(nullif(p_mensagem, ''), 'Erro sem mensagem'), 500), left(p_pilha, 4000),
          case when p_origem in ('janela', 'promessa', 'tela', 'servidor') then p_origem else 'janela' end, left(p_agente, 200), left(p_versao, 60), v_assinatura)
  on conflict (assinatura, (date_trunc('day', quando at time zone 'UTC'))) do update set repeticoes = privado.erros.repeticoes + 1, quando = now();
  return true;
end;
$$;

/** Os erros mais recentes, para a equipe. */
create or replace function public.erros_listar(p_antes bigint default null, p_limite integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.eh_equipe(array['suporte']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'quando', e.quando, 'rota', e.rota, 'mensagem', e.mensagem, 'pilha', e.pilha,
             'origem', e.origem, 'agente', e.agente, 'versao', e.versao, 'repeticoes', e.repeticoes) order by e.id desc)
      from (select * from privado.erros where p_antes is null or id < p_antes order by id desc limit least(greatest(p_limite, 1), 500)) e
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.erros_registrar(text, text, text, text, text, text), public.erros_listar(bigint, integer) from public, anon, authenticated;
grant execute on function public.erros_registrar(text, text, text, text, text, text) to anon;
grant execute on function public.erros_listar(bigint, integer) to authenticated;

-- ------------------------------------------------------------------ limpeza (rotina diária)

/** Apaga avisos velhos (30 dias), erros (30 dias) e inscrições de push paradas há 6 meses. */
create or replace function public.plataforma_rotina()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
  n integer;
begin
  if not privado.sistema_autorizado() and coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  delete from public.avisos_fila where criado_em < now() - interval '30 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('avisos', n);
  delete from privado.erros where quando < now() - interval '30 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('erros', n);
  delete from public.push_inscricoes where coalesce(ultimo_ok_em, criado_em) < now() - interval '180 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('push', n);
  return r;
end;
$$;

revoke all on function public.plataforma_rotina() from public, authenticated;
grant execute on function public.plataforma_rotina() to anon;

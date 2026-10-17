-- Contas com login (Supabase Auth) e separação total entre oficinas, lojas e equipe.
-- Cada oficina e cada loja tem membros; o banco só deixa cada pessoa ver e mudar o que é
-- da oficina ou da loja dela. A equipe entra com conta própria, segundo fator obrigatório
-- e papel (admin, suporte, financeiro), e cada ação dela fica registrada.
-- O servidor do app, quando age sozinho (webhook, rotina diária), usa a chave do sistema
-- no cabeçalho x-revisai-sistema; o banco guarda só o hash dela.

-- ------------------------------------------------------------------ chave do sistema

-- A chave do sistema é a mesma variável que o servidor já tem (EQUIPE_CHAVE, ou SISTEMA_CHAVE
-- quando for trocada). A senha e a sessão da equipe deixam de existir: a equipe entra com conta.
insert into privado.chaves (nome, hash)
select 'sistema', hash from privado.chaves where nome = 'equipe'
on conflict (nome) do nothing;

create or replace function privado.sistema_autorizado()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return privado.chave_confere('sistema', nullif(current_setting('request.headers', true), '')::json ->> 'x-revisai-sistema');
exception when others then
  return false;
end;
$$;

revoke all on function privado.sistema_autorizado() from public, anon, authenticated;
grant execute on function privado.sistema_autorizado() to anon, authenticated;

-- ------------------------------------------------------------------ equipe

create table privado.equipe (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 160),
  nome text check (char_length(nome) <= 80),
  papel text not null check (papel in ('admin', 'suporte', 'financeiro')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid
);

comment on table privado.equipe is 'Quem é da equipe do Revisaí e com qual papel. Só entra no painel com segundo fator.';

-- Convite para a equipe por e-mail: vira membro quando a pessoa entra com esse e-mail.
create table privado.equipe_convites (
  email text primary key check (email = lower(email) and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  papel text not null check (papel in ('admin', 'suporte', 'financeiro')),
  nome text check (char_length(nome) <= 80),
  criado_em timestamptz not null default now(),
  criado_por uuid
);

create table privado.equipe_aparelhos (
  user_id uuid not null references auth.users (id) on delete cascade,
  aparelho text not null check (aparelho ~ '^[0-9a-f]{64}$'),
  descricao text check (char_length(descricao) <= 200),
  ip text check (char_length(ip) <= 64),
  primeiro_em timestamptz not null default now(),
  ultimo_em timestamptz not null default now(),
  primary key (user_id, aparelho)
);

create table privado.auditoria (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  user_id uuid,
  email text,
  papel text,
  acao text not null check (char_length(acao) <= 60),
  tabela text check (char_length(tabela) <= 60),
  registro text check (char_length(registro) <= 120),
  antes jsonb,
  depois jsonb,
  ip text check (char_length(ip) <= 64)
);

create index auditoria_quando_idx on privado.auditoria (quando desc);
create index auditoria_user_idx on privado.auditoria (user_id, quando desc);

alter table privado.equipe enable row level security;
alter table privado.equipe_convites enable row level security;
alter table privado.equipe_aparelhos enable row level security;
alter table privado.auditoria enable row level security;
create policy "Ninguém pela API" on privado.equipe as restrictive for all to public using (false) with check (false);
create policy "Ninguém pela API" on privado.equipe_convites as restrictive for all to public using (false) with check (false);
create policy "Ninguém pela API" on privado.equipe_aparelhos as restrictive for all to public using (false) with check (false);
create policy "Ninguém pela API" on privado.auditoria as restrictive for all to public using (false) with check (false);
revoke all on privado.equipe, privado.equipe_convites, privado.equipe_aparelhos, privado.auditoria from public, anon, authenticated;

/**
 * A pessoa é da equipe, ativa, com um dos papéis pedidos (admin vale para todos), e passou
 * pelo segundo fator (aal2) nas últimas 12 horas. Depois disso o banco nega até ela confirmar
 * o código de novo, mesmo com a sessão aberta.
 */
create or replace function privado.eh_equipe(p_papeis text[] default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jwt jsonb := auth.jwt();
begin
  if v_jwt is null or coalesce(v_jwt ->> 'aal', '') <> 'aal2' then
    return false;
  end if;
  if not exists (
    select 1
      from jsonb_array_elements(case when jsonb_typeof(v_jwt -> 'amr') = 'array' then v_jwt -> 'amr' else '[]'::jsonb end) a
     where a ->> 'method' = 'totp'
       and (a ->> 'timestamp')::bigint > extract(epoch from now() - interval '12 hours')
  ) then
    return false;
  end if;
  return exists (
    select 1 from privado.equipe e
     where e.user_id = auth.uid()
       and e.ativo
       and (p_papeis is null or e.papel = 'admin' or e.papel = any (p_papeis))
  );
exception when others then
  return false;
end;
$$;

revoke all on function privado.eh_equipe(text[]) from public, anon, authenticated;
grant execute on function privado.eh_equipe(text[]) to anon, authenticated;

-- ------------------------------------------------------------------ oficinas

create table public.oficinas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 120),
  whatsapp text check (whatsapp ~ '^55[0-9]{10,11}$'),
  cidade text check (char_length(cidade) <= 80),
  uf text check (uf ~ '^[A-Z]{2}$'),
  endereco text check (char_length(endereco) <= 160),
  cnpj text check (cnpj ~ '^[0-9]{14}$'),
  link_avaliacao text check (char_length(link_avaliacao) <= 300 and link_avaliacao ~ '^https://'),
  pro_ate date,
  teste_ate date,
  fundador boolean not null default false,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null
);

comment on table public.oficinas is 'Cada oficina cliente. O plano (pro_ate, teste_ate) só muda pelo servidor e pela equipe.';

create table public.oficina_membros (
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel text not null check (papel in ('dono', 'gerente', 'mecanico')),
  email text check (char_length(email) <= 160),
  nome text check (char_length(nome) <= 80),
  criado_em timestamptz not null default now(),
  primary key (oficina_id, user_id)
);

create index oficina_membros_user_idx on public.oficina_membros (user_id);

-- ------------------------------------------------------------------ lojas

create table public.fornecedor_membros (
  fornecedor_id bigint not null references public.fornecedores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel text not null check (papel in ('dono', 'vendedor')),
  email text check (char_length(email) <= 160),
  nome text check (char_length(nome) <= 80),
  criado_em timestamptz not null default now(),
  primary key (fornecedor_id, user_id)
);

create index fornecedor_membros_user_idx on public.fornecedor_membros (user_id);

alter table public.fornecedores
  add column if not exists cnpj text check (cnpj ~ '^[0-9]{14}$'),
  add column if not exists verificacao text not null default 'aprovada' check (verificacao in ('pendente', 'aprovada', 'recusada')),
  add column if not exists verificacao_obs text check (char_length(verificacao_obs) <= 300),
  add column if not exists email text check (char_length(email) <= 160),
  add column if not exists atualizado_em timestamptz not null default now();

-- ------------------------------------------------------------------ quem é o quê

create or replace function privado.minhas_oficinas()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.oficina_id from public.oficina_membros m where m.user_id = auth.uid();
$$;

create or replace function privado.meus_fornecedores()
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
  select m.fornecedor_id from public.fornecedor_membros m where m.user_id = auth.uid();
$$;

create or replace function privado.papel_na_oficina(p_oficina uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel from public.oficina_membros m where m.oficina_id = p_oficina and m.user_id = auth.uid();
$$;

create or replace function privado.papel_no_fornecedor(p_fornecedor bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel from public.fornecedor_membros m where m.fornecedor_id = p_fornecedor and m.user_id = auth.uid();
$$;

revoke all on function privado.minhas_oficinas(), privado.meus_fornecedores(), privado.papel_na_oficina(uuid), privado.papel_no_fornecedor(bigint) from public, anon, authenticated;
grant execute on function privado.minhas_oficinas(), privado.meus_fornecedores(), privado.papel_na_oficina(uuid), privado.papel_no_fornecedor(bigint) to anon, authenticated;

-- Nos gatilhos de proteção: a mudança veio direto da API (anon ou authenticated) ou de dentro
-- de uma função do próprio banco (que roda como dona e já conferiu tudo).
create or replace function privado.veio_da_api()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated');
$$;
revoke all on function privado.veio_da_api() from public;
grant execute on function privado.veio_da_api() to anon, authenticated;

-- ------------------------------------------------------------------ convites

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('oficina', 'fornecedor')),
  oficina_id uuid references public.oficinas (id) on delete cascade,
  fornecedor_id bigint references public.fornecedores (id) on delete cascade,
  email text not null check (email = lower(email) and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 160),
  papel text not null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '14 days',
  aceito_em timestamptz,
  check (
    (tipo = 'oficina' and oficina_id is not null and fornecedor_id is null and papel in ('dono', 'gerente', 'mecanico'))
    or (tipo = 'fornecedor' and fornecedor_id is not null and oficina_id is null and papel in ('dono', 'vendedor'))
  )
);

create index convites_email_idx on public.convites (email) where aceito_em is null;
create index convites_oficina_idx on public.convites (oficina_id);
create index convites_fornecedor_idx on public.convites (fornecedor_id);

-- ------------------------------------------------------------------ RLS das tabelas novas

alter table public.oficinas enable row level security;
alter table public.oficina_membros enable row level security;
alter table public.fornecedor_membros enable row level security;
alter table public.convites enable row level security;

create policy "Membros veem a oficina" on public.oficinas for select to authenticated
  using (id in (select privado.minhas_oficinas()) or (select privado.eh_equipe()));
create policy "Equipe muda a oficina" on public.oficinas for update to authenticated
  using ((select privado.eh_equipe(array['suporte', 'financeiro'])))
  with check ((select privado.eh_equipe(array['suporte', 'financeiro'])));
create policy "Sistema lê as oficinas" on public.oficinas for select to anon
  using ((select privado.sistema_autorizado()));
create policy "Sistema muda as oficinas" on public.oficinas for update to anon
  using ((select privado.sistema_autorizado())) with check ((select privado.sistema_autorizado()));

create policy "Membros veem os colegas" on public.oficina_membros for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe()));
create policy "Membros veem os colegas da loja" on public.fornecedor_membros for select to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()));

create policy "Convites de quem pode ver" on public.convites for select to authenticated
  using (
    email = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (oficina_id is not null and privado.papel_na_oficina(oficina_id) in ('dono', 'gerente'))
    or (fornecedor_id is not null and privado.papel_no_fornecedor(fornecedor_id) = 'dono')
    or (select privado.eh_equipe())
  );

revoke all on public.oficinas, public.oficina_membros, public.fornecedor_membros, public.convites from anon, authenticated;
grant select, update on public.oficinas to anon, authenticated;
grant select on public.oficina_membros, public.fornecedor_membros, public.convites to authenticated;

-- A oficina e a equipe mudam os dados de cadastro; o plano só pela equipe e pelo sistema.
create or replace function privado.proteger_oficina()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not privado.veio_da_api() or privado.sistema_autorizado() or privado.eh_equipe(array['financeiro']) then
    new.atualizado_em := now();
    return new;
  end if;
  if new.pro_ate is distinct from old.pro_ate or new.teste_ate is distinct from old.teste_ate
     or new.fundador is distinct from old.fundador or new.ativa is distinct from old.ativa
     or new.criado_por is distinct from old.criado_por or new.id is distinct from old.id then
    raise exception 'Só a equipe muda o plano' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger oficinas_proteger before update on public.oficinas
  for each row execute function privado.proteger_oficina();

-- ------------------------------------------------------------------ lojas: o que a loja muda

-- A loja muda o próprio cadastro (descrição, contato), mas não se ativa, não vira Destaque
-- e não se aprova: isso é da equipe.
create or replace function privado.proteger_fornecedor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not privado.veio_da_api() or privado.sistema_autorizado() or privado.eh_equipe(array['suporte', 'financeiro']) then
    new.atualizado_em := now();
    return new;
  end if;
  if new.ativo is distinct from old.ativo or new.destaque is distinct from old.destaque
     or new.destaque_ate is distinct from old.destaque_ate or new.demonstracao is distinct from old.demonstracao
     or new.verificacao is distinct from old.verificacao or new.verificacao_obs is distinct from old.verificacao_obs
     or new.cnpj is distinct from old.cnpj or new.id is distinct from old.id then
    raise exception 'Só a equipe muda isso na loja' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger fornecedores_proteger before update on public.fornecedores
  for each row execute function privado.proteger_fornecedor();

-- ------------------------------------------------------------------ auditoria

/** Grava quem da equipe (ou o sistema) mudou o quê. A oficina e a loja não aparecem aqui. */
create or replace function privado.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_equipe privado.equipe%rowtype;
  v_ip text;
  v_chave text;
begin
  select * into v_equipe from privado.equipe e where e.user_id = v_uid;
  if not found and not privado.sistema_autorizado() then
    return coalesce(new, old);
  end if;
  begin
    v_ip := left(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-revisai-ip', ''), 64);
  exception when others then
    v_ip := null;
  end;
  v_chave := coalesce(to_jsonb(coalesce(new, old)) ->> 'id', to_jsonb(coalesce(new, old)) ->> 'fornecedor_id', to_jsonb(coalesce(new, old)) ->> 'user_id', to_jsonb(coalesce(new, old)) ->> 'codigo');
  insert into privado.auditoria (user_id, email, papel, acao, tabela, registro, antes, depois, ip)
  values (
    v_uid,
    v_equipe.email,
    coalesce(v_equipe.papel, 'sistema'),
    lower(tg_op),
    tg_table_schema || '.' || tg_table_name,
    left(v_chave, 120),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    nullif(v_ip, '')
  );
  return coalesce(new, old);
end;
$$;

create trigger auditar after insert or update or delete on public.oficinas for each row execute function privado.auditar();
create trigger auditar after insert or update or delete on public.fornecedores for each row execute function privado.auditar();
create trigger auditar after insert or update or delete on public.fornecedores_contrato for each row execute function privado.auditar();
create trigger auditar after insert or update or delete on public.assinaturas for each row execute function privado.auditar();
create trigger auditar after insert or update or delete on public.alertas_creditos for each row execute function privado.auditar();
create trigger auditar after insert or update or delete on public.impulsos for each row execute function privado.auditar();
create trigger auditar after insert or update or delete on public.produtos_referencia for each row execute function privado.auditar();
create trigger auditar after update or delete on public.pedidos for each row execute function privado.auditar();
create trigger auditar after update or delete on public.interessados for each row execute function privado.auditar();
create trigger auditar after insert or update or delete on privado.equipe for each row execute function privado.auditar();
create trigger auditar after insert or update or delete on privado.equipe_convites for each row execute function privado.auditar();

-- ------------------------------------------------------------------ RPCs da conta

/** Tudo o que o app precisa saber de quem entrou: oficinas, lojas, convites e se é da equipe. */
create or replace function public.minha_conta()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'usuario', jsonb_build_object('id', v_uid, 'email', v_email),
    'oficinas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'nome', o.nome, 'papel', m.papel, 'cidade', o.cidade, 'uf', o.uf, 'whatsapp', o.whatsapp, 'endereco', o.endereco,
        'proAte', o.pro_ate, 'testeAte', o.teste_ate, 'fundador', o.fundador, 'ativa', o.ativa,
        'plano', case when o.pro_ate >= v_hoje then 'pro' when o.teste_ate >= v_hoje then 'teste' else 'gratis' end
      ) order by o.criado_em)
        from public.oficina_membros m join public.oficinas o on o.id = m.oficina_id
       where m.user_id = v_uid), '[]'::jsonb),
    'fornecedores', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'papel', m.papel, 'ativo', f.ativo, 'verificacao', f.verificacao) order by f.nome)
        from public.fornecedor_membros m join public.fornecedores f on f.id = m.fornecedor_id
       where m.user_id = v_uid), '[]'::jsonb),
    'convites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'tipo', c.tipo, 'papel', c.papel,
        'nome', coalesce(o.nome, f.nome), 'expiraEm', c.expira_em
      ) order by c.criado_em)
        from public.convites c
        left join public.oficinas o on o.id = c.oficina_id
        left join public.fornecedores f on f.id = c.fornecedor_id
       where c.email = v_email and v_email <> '' and c.aceito_em is null and c.expira_em > now()), '[]'::jsonb),
    'equipe', (select e.papel from privado.equipe e where e.user_id = v_uid and e.ativo)
  );
end;
$$;

/** Cria a oficina de quem entrou e põe a pessoa como dona. */
create or replace function public.criar_oficina(p_nome text, p_whatsapp text default null, p_cidade text default null, p_uf text default null, p_endereco text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  if (select count(*) from public.oficina_membros m where m.user_id = v_uid and m.papel = 'dono') >= 3 then
    raise exception 'Limite de oficinas por conta' using errcode = 'P0001';
  end if;
  insert into public.oficinas (nome, whatsapp, cidade, uf, endereco, criado_por)
  values (trim(p_nome), nullif(p_whatsapp, ''), nullif(trim(p_cidade), ''), nullif(p_uf, ''), nullif(trim(p_endereco), ''), v_uid)
  returning id into v_id;
  insert into public.oficina_membros (oficina_id, user_id, papel, email)
  values (v_id, v_uid, 'dono', lower(auth.jwt() ->> 'email'));
  return v_id;
end;
$$;

/** Pede para vender no Revisaí: a loja nasce desligada até a equipe conferir o CNPJ. */
create or replace function public.criar_loja(p_nome text, p_cnpj text, p_whatsapp text default null, p_cidade text default null, p_uf text default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  if (select count(*) from public.fornecedor_membros m where m.user_id = v_uid and m.papel = 'dono') >= 3 then
    raise exception 'Limite de lojas por conta' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fornecedores f where f.cnpj = p_cnpj) then
    raise exception 'Esse CNPJ já tem loja no Revisaí' using errcode = '23505';
  end if;
  insert into public.fornecedores (nome, cnpj, whatsapp, cidade, uf, ativo, demonstracao, verificacao, email)
  values (trim(p_nome), p_cnpj, nullif(p_whatsapp, ''), nullif(trim(p_cidade), ''), nullif(p_uf, ''), false, false, 'pendente', lower(auth.jwt() ->> 'email'))
  returning id into v_id;
  insert into public.fornecedores_contrato (fornecedor_id, plano, comissao_percentual, mensalidade, email)
  values (v_id, 'vitrine', 5, 0, lower(auth.jwt() ->> 'email'))
  on conflict (fornecedor_id) do nothing;
  insert into public.fornecedor_membros (fornecedor_id, user_id, papel, email)
  values (v_id, v_uid, 'dono', lower(auth.jwt() ->> 'email'));
  return v_id;
end;
$$;

/** Aceita um convite feito para o e-mail de quem entrou (ou todos, com p_id nulo). */
create or replace function public.aceitar_convite(p_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_c public.convites%rowtype;
  v_n integer := 0;
begin
  if v_uid is null or v_email = '' then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  for v_c in
    select * from public.convites c
     where c.email = v_email and c.aceito_em is null and c.expira_em > now() and (p_id is null or c.id = p_id)
     for update
  loop
    if v_c.tipo = 'oficina' then
      insert into public.oficina_membros (oficina_id, user_id, papel, email)
      values (v_c.oficina_id, v_uid, v_c.papel, v_email)
      on conflict (oficina_id, user_id) do update set papel = excluded.papel;
    else
      insert into public.fornecedor_membros (fornecedor_id, user_id, papel, email)
      values (v_c.fornecedor_id, v_uid, v_c.papel, v_email)
      on conflict (fornecedor_id, user_id) do update set papel = excluded.papel;
    end if;
    update public.convites set aceito_em = now() where id = v_c.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.recusar_convite(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.convites c
   where c.id = p_id and c.email = lower(coalesce(auth.jwt() ->> 'email', '')) and c.aceito_em is null;
  return found;
end;
$$;

/**
 * Convida alguém por e-mail. Na oficina, o dono convida qualquer papel e o gerente só mecânico;
 * na loja, só o dono convida. A equipe convida o dono de uma loja que ela cadastrou.
 */
create or replace function public.convidar(p_tipo text, p_alvo text, p_email text, p_papel text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_papel text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  if p_tipo = 'oficina' then
    -- quem não é da oficina tem papel nulo: o coalesce impede que o "not (nulo)" deixe passar
    v_papel := coalesce(privado.papel_na_oficina(p_alvo::uuid), '');
    if not (v_papel = 'dono' or (v_papel = 'gerente' and p_papel = 'mecanico')) then
      raise exception 'Só o dono convida' using errcode = '42501';
    end if;
    if (select count(*) from public.convites c where c.oficina_id = p_alvo::uuid and c.aceito_em is null and c.expira_em > now()) >= 20 then
      raise exception 'Muitos convites abertos' using errcode = 'P0001';
    end if;
    delete from public.convites c where c.oficina_id = p_alvo::uuid and c.email = v_email and c.aceito_em is null;
    insert into public.convites (tipo, oficina_id, email, papel, criado_por)
    values ('oficina', p_alvo::uuid, v_email, p_papel, v_uid)
    returning id into v_id;
  elsif p_tipo = 'fornecedor' then
    if not (coalesce(privado.papel_no_fornecedor(p_alvo::bigint), '') = 'dono' or privado.eh_equipe(array['suporte'])) then
      raise exception 'Só o dono convida' using errcode = '42501';
    end if;
    if (select count(*) from public.convites c where c.fornecedor_id = p_alvo::bigint and c.aceito_em is null and c.expira_em > now()) >= 20 then
      raise exception 'Muitos convites abertos' using errcode = 'P0001';
    end if;
    delete from public.convites c where c.fornecedor_id = p_alvo::bigint and c.email = v_email and c.aceito_em is null;
    insert into public.convites (tipo, fornecedor_id, email, papel, criado_por)
    values ('fornecedor', p_alvo::bigint, v_email, p_papel, v_uid)
    returning id into v_id;
  else
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

create or replace function public.cancelar_convite(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.convites%rowtype;
begin
  select * into v_c from public.convites where id = p_id and aceito_em is null;
  if not found then
    return false;
  end if;
  if not (
    (v_c.oficina_id is not null and coalesce(privado.papel_na_oficina(v_c.oficina_id), '') in ('dono', 'gerente'))
    or (v_c.fornecedor_id is not null and coalesce(privado.papel_no_fornecedor(v_c.fornecedor_id), '') = 'dono')
    or privado.eh_equipe(array['suporte'])
  ) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  delete from public.convites where id = p_id;
  return true;
end;
$$;

/** O dono tira alguém da oficina ou da loja (a pessoa também pode sair sozinha). Nunca o último dono. */
create or replace function public.remover_membro(p_tipo text, p_alvo text, p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_papel_alvo text;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  if p_tipo = 'oficina' then
    if p_user <> v_uid and coalesce(privado.papel_na_oficina(p_alvo::uuid), '') <> 'dono' then
      raise exception 'Só o dono tira alguém' using errcode = '42501';
    end if;
    select papel into v_papel_alvo from public.oficina_membros where oficina_id = p_alvo::uuid and user_id = p_user;
    if v_papel_alvo = 'dono' and (select count(*) from public.oficina_membros where oficina_id = p_alvo::uuid and papel = 'dono') <= 1 then
      raise exception 'A oficina precisa de um dono' using errcode = 'P0001';
    end if;
    delete from public.oficina_membros where oficina_id = p_alvo::uuid and user_id = p_user;
  elsif p_tipo = 'fornecedor' then
    if p_user <> v_uid and coalesce(privado.papel_no_fornecedor(p_alvo::bigint), '') <> 'dono' and not privado.eh_equipe(array['suporte']) then
      raise exception 'Só o dono tira alguém' using errcode = '42501';
    end if;
    select papel into v_papel_alvo from public.fornecedor_membros where fornecedor_id = p_alvo::bigint and user_id = p_user;
    if v_papel_alvo = 'dono' and (select count(*) from public.fornecedor_membros where fornecedor_id = p_alvo::bigint and papel = 'dono') <= 1 then
      raise exception 'A loja precisa de um dono' using errcode = 'P0001';
    end if;
    delete from public.fornecedor_membros where fornecedor_id = p_alvo::bigint and user_id = p_user;
  else
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
  return found;
end;
$$;

/** O dono muda o papel de alguém da oficina (o último dono não deixa de ser dono). */
create or replace function public.mudar_papel(p_oficina uuid, p_user uuid, p_papel text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(privado.papel_na_oficina(p_oficina), '') <> 'dono' then
    raise exception 'Só o dono muda papéis' using errcode = '42501';
  end if;
  if p_papel not in ('dono', 'gerente', 'mecanico') then
    raise exception 'Papel inválido' using errcode = '22023';
  end if;
  if p_papel <> 'dono'
     and (select papel from public.oficina_membros where oficina_id = p_oficina and user_id = p_user) = 'dono'
     and (select count(*) from public.oficina_membros where oficina_id = p_oficina and papel = 'dono') <= 1 then
    raise exception 'A oficina precisa de um dono' using errcode = 'P0001';
  end if;
  update public.oficina_membros set papel = p_papel where oficina_id = p_oficina and user_id = p_user;
  return found;
end;
$$;

-- ------------------------------------------------------------------ equipe: entrada e aparelhos

/**
 * Quem tem convite da equipe vira membro ao entrar com segundo fator. Devolve o papel
 * (ou null quando não é da equipe). Chamada depois do código do autenticador.
 */
create or replace function public.equipe_entrar(p_aparelho text, p_descricao text default null, p_ip text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_conv privado.equipe_convites%rowtype;
  v_papel text;
  v_novo boolean := false;
begin
  if v_uid is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    return jsonb_build_object('papel', null);
  end if;
  select * into v_conv from privado.equipe_convites where email = v_email;
  if found then
    insert into privado.equipe (user_id, email, nome, papel, criado_por)
    values (v_uid, v_email, v_conv.nome, v_conv.papel, v_conv.criado_por)
    on conflict (user_id) do update set papel = excluded.papel, ativo = true;
    delete from privado.equipe_convites where email = v_email;
  end if;
  select papel into v_papel from privado.equipe where user_id = v_uid and ativo;
  if v_papel is null then
    return jsonb_build_object('papel', null);
  end if;
  if p_aparelho ~ '^[0-9a-f]{64}$' then
    insert into privado.equipe_aparelhos (user_id, aparelho, descricao, ip)
    values (v_uid, p_aparelho, left(p_descricao, 200), left(p_ip, 64))
    on conflict (user_id, aparelho) do update set ultimo_em = now(), ip = excluded.ip
    returning (xmax = 0) into v_novo;
    if v_novo then
      insert into privado.auditoria (user_id, email, papel, acao, tabela, registro, depois, ip)
      values (v_uid, v_email, v_papel, 'aparelho_novo', 'privado.equipe_aparelhos', left(p_aparelho, 16), jsonb_build_object('descricao', left(p_descricao, 200)), left(p_ip, 64));
    end if;
  end if;
  insert into privado.auditoria (user_id, email, papel, acao, ip) values (v_uid, v_email, v_papel, 'entrou', left(p_ip, 64));
  return jsonb_build_object('papel', v_papel, 'aparelhoNovo', v_novo);
end;
$$;

create or replace function public.equipe_listar()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.eh_equipe(array['admin']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'membros', coalesce((select jsonb_agg(jsonb_build_object('userId', e.user_id, 'email', e.email, 'nome', e.nome, 'papel', e.papel, 'ativo', e.ativo, 'criadoEm', e.criado_em,
        'ultimoAcesso', (select max(a.ultimo_em) from privado.equipe_aparelhos a where a.user_id = e.user_id)) order by e.criado_em) from privado.equipe e), '[]'::jsonb),
    'convites', coalesce((select jsonb_agg(jsonb_build_object('email', c.email, 'papel', c.papel, 'nome', c.nome, 'criadoEm', c.criado_em) order by c.criado_em) from privado.equipe_convites c), '[]'::jsonb)
  );
end;
$$;

create or replace function public.equipe_convidar(p_email text, p_papel text, p_nome text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.eh_equipe(array['admin']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  insert into privado.equipe_convites (email, papel, nome, criado_por)
  values (lower(trim(p_email)), p_papel, nullif(trim(p_nome), ''), auth.uid())
  on conflict (email) do update set papel = excluded.papel, nome = excluded.nome;
  return true;
end;
$$;

create or replace function public.equipe_mudar(p_user uuid, p_papel text, p_ativo boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.eh_equipe(array['admin']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_user = auth.uid() and (not p_ativo or p_papel <> 'admin') then
    raise exception 'Você não pode tirar o próprio acesso' using errcode = 'P0001';
  end if;
  update privado.equipe set papel = p_papel, ativo = p_ativo where user_id = p_user;
  return found;
end;
$$;

create or replace function public.equipe_cancelar_convite(p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.eh_equipe(array['admin']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  delete from privado.equipe_convites where email = lower(trim(p_email));
  return found;
end;
$$;

/** O histórico do que a equipe e o sistema fizeram, do mais novo para o mais velho. */
create or replace function public.auditoria_listar(p_antes bigint default null, p_limite integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.eh_equipe(array['admin']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'quando', a.quando, 'email', a.email, 'papel', a.papel, 'acao', a.acao,
             'tabela', a.tabela, 'registro', a.registro, 'antes', a.antes, 'depois', a.depois, 'ip', a.ip) order by a.id desc)
      from (select * from privado.auditoria where p_antes is null or id < p_antes order by id desc limit least(greatest(p_limite, 1), 500)) a
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.minha_conta(), public.criar_oficina(text, text, text, text, text), public.criar_loja(text, text, text, text, text),
  public.aceitar_convite(uuid), public.recusar_convite(uuid), public.convidar(text, text, text, text), public.cancelar_convite(uuid),
  public.remover_membro(text, text, uuid), public.mudar_papel(uuid, uuid, text), public.equipe_entrar(text, text, text), public.equipe_listar(),
  public.equipe_convidar(text, text, text), public.equipe_mudar(uuid, text, boolean), public.equipe_cancelar_convite(text),
  public.auditoria_listar(bigint, integer) from public, anon;
grant execute on function public.minha_conta(), public.criar_oficina(text, text, text, text, text), public.criar_loja(text, text, text, text, text),
  public.aceitar_convite(uuid), public.recusar_convite(uuid), public.convidar(text, text, text, text), public.cancelar_convite(uuid),
  public.remover_membro(text, text, uuid), public.mudar_papel(uuid, uuid, text), public.equipe_entrar(text, text, text), public.equipe_listar(),
  public.equipe_convidar(text, text, text), public.equipe_mudar(uuid, text, boolean), public.equipe_cancelar_convite(text),
  public.auditoria_listar(bigint, integer) to authenticated;

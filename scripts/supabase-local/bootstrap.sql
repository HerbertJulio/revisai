-- Papéis e esquemas parecidos com os do Supabase, para rodar as migrações do app localmente.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator noinherit login password 'postgres';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin noinherit createrole login password 'postgres';
create role supabase_storage_admin noinherit createrole login password 'postgres';
create role supabase_realtime_admin nologin;
grant anon, authenticated, service_role to postgres;

create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists citext with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role, supabase_auth_admin;

alter database postgres set search_path to "$user", public, extensions;

-- auth (as tabelas vêm das migrações do GoTrue)
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant create on database postgres to supabase_auth_admin;

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
create or replace function auth.email() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.email', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'))::text
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
alter function auth.uid() owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
alter function auth.email() owner to supabase_auth_admin;
alter function auth.jwt() owner to supabase_auth_admin;
grant execute on function auth.uid(), auth.role(), auth.email(), auth.jwt() to anon, authenticated, service_role, postgres;

-- public: o padrão do Supabase dá acesso às tabelas e o RLS decide
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;

-- storage (só o que o app usa)
create schema if not exists storage authorization supabase_storage_admin;
grant usage on schema storage to anon, authenticated, service_role, postgres;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role, postgres;
alter table storage.buckets owner to postgres;
alter table storage.objects owner to postgres;
create or replace function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end $$;
create or replace function storage.filename(name text) returns text language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end $$;
create or replace function storage.extension(name text) returns text language plpgsql immutable as $$
declare _parts text[]; _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end $$;
grant execute on function storage.foldername(text), storage.filename(text), storage.extension(text) to anon, authenticated, service_role;

-- realtime: o publication que o Supabase cria
create publication supabase_realtime;

-- avisa o PostgREST para recarregar o esquema (fora do public, para não aparecer na API)
create schema if not exists local;
create or replace function local.pgrst_watch() returns event_trigger language plpgsql as $$
begin notify pgrst, 'reload schema'; end $$;
create event trigger pgrst_watch on ddl_command_end execute procedure local.pgrst_watch();

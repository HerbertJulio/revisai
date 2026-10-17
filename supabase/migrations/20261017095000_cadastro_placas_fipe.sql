-- O carro pela placa e o valor da tabela FIPE. O que o provedor de placas respondeu fica
-- guardado 30 dias (a mesma placa não é paga duas vezes) e o que a FIPE respondeu fica até o mês
-- virar. Só o servidor lê e grava essas tabelas, com a chave do sistema. Cada oficina tem a sua
-- cota de consultas de placa por mês (20; 200 no Pro e no teste do Pro), contada aqui, à parte
-- da cota da IA. Toda conferência de permissão usa coalesce: um papel NULL (quem não é membro)
-- não pode fazer o IF negativo dar NULL e pular o erro. Pode rodar de novo sem estragar nada.

-- ------------------------------------------------------------------ placas já consultadas

create table if not exists public.placas_cache (
  placa text primary key check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  dados jsonb not null check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 8192),
  consultado_em timestamptz not null default now()
);

comment on table public.placas_cache is 'O que o provedor de placas respondeu (já no formato do app), por 30 dias. Só o servidor lê e grava.';

create index if not exists placas_cache_consultado_idx on public.placas_cache (consultado_em);
alter table public.placas_cache enable row level security;
drop policy if exists "Ninguém pela API" on public.placas_cache;
create policy "Ninguém pela API" on public.placas_cache as restrictive for all to public using (false) with check (false);
revoke all on public.placas_cache from public, anon, authenticated;

/** O que está guardado da placa (até 30 dias), ou null. Só o servidor. */
create or replace function public.placas_cache_ler(p_placa text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(privado.sistema_autorizado(), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object('dados', c.dados, 'consultadoEm', c.consultado_em)
      from public.placas_cache c
     where c.placa = upper(coalesce(p_placa, ''))
       and c.consultado_em > now() - interval '30 days'
  );
end;
$$;

/** Guarda a resposta da placa e tira aos poucos o que passou dos 30 dias. Só o servidor. */
create or replace function public.placas_cache_gravar(p_placa text, p_dados jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not coalesce(privado.sistema_autorizado(), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if coalesce(p_placa, '') !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' or jsonb_typeof(p_dados) is distinct from 'object' then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;
  insert into public.placas_cache as c (placa, dados, consultado_em)
  values (p_placa, p_dados, now())
  on conflict (placa) do update set dados = excluded.dados, consultado_em = excluded.consultado_em;
  delete from public.placas_cache
   where ctid in (select x.ctid from public.placas_cache x where x.consultado_em < now() - interval '30 days' limit 200);
end;
$$;

revoke all on function public.placas_cache_ler(text), public.placas_cache_gravar(text, jsonb) from public, anon, authenticated;
grant execute on function public.placas_cache_ler(text), public.placas_cache_gravar(text, jsonb) to anon;

-- ------------------------------------------------------------------ cota de placas por oficina

create table if not exists privado.placas_uso (
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  quantidade integer not null default 0 check (quantidade >= 0),
  primary key (oficina_id, mes)
);

alter table privado.placas_uso enable row level security;
drop policy if exists "Ninguém pela API" on privado.placas_uso;
create policy "Ninguém pela API" on privado.placas_uso as restrictive for all to public using (false) with check (false);
revoke all on privado.placas_uso from public, anon, authenticated;

/** Quantas consultas de placa o plano dá por mês (o teste do Pro vale como Pro). */
create or replace function privado.limite_de_placas(p_plano text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_plano in ('pro', 'teste') then 200 else 20 end;
$$;
revoke all on function privado.limite_de_placas(text) from public, anon, authenticated;

/**
 * Gasta uma consulta de placa do mês (fuso de Brasília) antes de chamar o provedor. Passou do
 * limite do plano, dá erro RV090 e não gasta nada. Quem chama: um membro da oficina ou o sistema.
 */
create or replace function public.placas_consumir(p_oficina uuid)
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
  if coalesce(privado.papel_na_oficina(p_oficina), '') = '' and not coalesce(privado.sistema_autorizado(), false) then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if not exists (select 1 from public.oficinas o where o.id = p_oficina and o.ativa) then
    raise exception 'Oficina desativada' using errcode = '42501';
  end if;
  v_plano := privado.plano_da_oficina(p_oficina);
  v_limite := privado.limite_de_placas(v_plano);
  insert into privado.placas_uso as u (oficina_id, mes, quantidade)
  values (p_oficina, v_mes, 1)
  on conflict (oficina_id, mes) do update set quantidade = u.quantidade + 1
  returning quantidade into v_usado;
  if v_usado > v_limite then
    raise exception 'As consultas de placa do mês acabaram' using errcode = 'RV090', detail = jsonb_build_object('plano', v_plano, 'limite', v_limite)::text;
  end if;
  return jsonb_build_object('plano', v_plano, 'usado', v_usado, 'limite', v_limite);
end;
$$;

/** Devolve a consulta quando o provedor falhou sem cobrar (só o servidor, com a chave do sistema). */
create or replace function public.placas_devolver(p_oficina uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not coalesce(privado.sistema_autorizado(), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update privado.placas_uso set quantidade = greatest(quantidade - 1, 0)
   where oficina_id = p_oficina and mes = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  return found;
end;
$$;

/** Quantas consultas de placa a oficina já usou no mês e quantas tem. */
create or replace function public.placas_uso_do_mes(p_oficina uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plano text;
begin
  if coalesce(privado.papel_na_oficina(p_oficina), '') = '' and not coalesce(privado.sistema_autorizado(), false) then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  v_plano := privado.plano_da_oficina(p_oficina);
  if v_plano is null then
    raise exception 'Oficina não encontrada' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'plano', v_plano,
    'usado', coalesce((select u.quantidade from privado.placas_uso u where u.oficina_id = p_oficina and u.mes = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')), 0),
    'limite', privado.limite_de_placas(v_plano)
  );
end;
$$;

revoke all on function public.placas_consumir(uuid), public.placas_devolver(uuid), public.placas_uso_do_mes(uuid) from public, anon, authenticated;
grant execute on function public.placas_consumir(uuid), public.placas_uso_do_mes(uuid) to anon, authenticated;
grant execute on function public.placas_devolver(uuid) to anon;

-- ------------------------------------------------------------------ tabela FIPE do mês

create table if not exists public.fipe_cache (
  chave text not null check (char_length(chave) between 3 and 120 and chave ~ '^[a-z]+(:[A-Za-z0-9-]+){0,4}$'),
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  dados jsonb not null check (pg_column_size(dados) <= 524288),
  consultado_em timestamptz not null default now(),
  primary key (chave, mes)
);

comment on table public.fipe_cache is 'O que a tabela FIPE respondeu (marcas, modelos, anos, preços), por mês. Só o servidor lê e grava.';

alter table public.fipe_cache enable row level security;
drop policy if exists "Ninguém pela API" on public.fipe_cache;
create policy "Ninguém pela API" on public.fipe_cache as restrictive for all to public using (false) with check (false);
revoke all on public.fipe_cache from public, anon, authenticated;

/** O que está guardado da FIPE para a chave no mês, ou null. Só o servidor. */
create or replace function public.fipe_cache_ler(p_chave text, p_mes text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(privado.sistema_autorizado(), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return (select c.dados from public.fipe_cache c where c.chave = p_chave and c.mes = p_mes);
end;
$$;

/** Guarda a resposta da FIPE do mês e tira o que é de antes do mês passado. Só o servidor. */
create or replace function public.fipe_cache_gravar(p_chave text, p_mes text, p_dados jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not coalesce(privado.sistema_autorizado(), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if coalesce(p_mes, '') !~ '^[0-9]{4}-[0-9]{2}$' or p_dados is null then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;
  insert into public.fipe_cache as c (chave, mes, dados, consultado_em)
  values (p_chave, p_mes, p_dados, now())
  on conflict (chave, mes) do update set dados = excluded.dados, consultado_em = excluded.consultado_em;
  delete from public.fipe_cache
   where ctid in (
     select x.ctid from public.fipe_cache x
      where x.mes < to_char(to_date(p_mes || '-01', 'YYYY-MM-DD') - interval '1 month', 'YYYY-MM')
      limit 500
   );
end;
$$;

revoke all on function public.fipe_cache_ler(text, text), public.fipe_cache_gravar(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.fipe_cache_ler(text, text), public.fipe_cache_gravar(text, text, jsonb) to anon;

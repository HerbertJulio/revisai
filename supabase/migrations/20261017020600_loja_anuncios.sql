-- Anúncio por clique: além do impulso por período (7, 15 ou 30 dias por um valor fechado), a loja
-- pode pagar por clique, com um teto por dia. A vitrine da oficina registra quem viu (uma vez por
-- oficina por dia) e quem clicou (um clique cobrado por oficina por anúncio por dia); passado o teto
-- do dia, o clique fica registrado sem custo e o anúncio sai da vitrine até o dia seguinte.
-- A loja vê só os números somados, nunca quais oficinas viram ou clicaram.

alter table public.impulsos
  add column if not exists cpc numeric(10, 2) check (cpc >= 0.1 and cpc <= 100),
  add column if not exists orcamento_diario numeric(10, 2) check (orcamento_diario >= 1 and orcamento_diario <= 10000);

alter table public.impulsos drop constraint if exists impulsos_clique_completo;
alter table public.impulsos add constraint impulsos_clique_completo check ((cpc is null) = (orcamento_diario is null) and (cpc is null or orcamento_diario >= cpc));

comment on column public.impulsos.cpc is 'Anúncio por clique: quanto custa cada clique (vazio = impulso por período).';
comment on column public.impulsos.orcamento_diario is 'Anúncio por clique: teto de gasto por dia.';

create table if not exists public.anuncios_cliques (
  id bigint generated always as identity primary key,
  impulso_id bigint not null references public.impulsos (id) on delete cascade,
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  quando timestamptz not null default now(),
  custo numeric(10, 2) not null default 0 check (custo >= 0),
  constraint anuncios_cliques_um_por_dia unique (impulso_id, oficina_id, dia)
);
create index if not exists anuncios_cliques_impulso_dia_idx on public.anuncios_cliques (impulso_id, dia);

create table if not exists public.anuncios_impressoes (
  impulso_id bigint not null references public.impulsos (id) on delete cascade,
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  primary key (impulso_id, oficina_id, dia)
);
create index if not exists anuncios_impressoes_impulso_dia_idx on public.anuncios_impressoes (impulso_id, dia);

comment on table public.anuncios_cliques is 'Cliques nos anúncios (um por oficina por anúncio por dia) e o custo cobrado de cada um.';
comment on table public.anuncios_impressoes is 'Oficinas que viram cada anúncio, uma vez por dia.';

-- só pelas funções abaixo; a equipe lê tudo, a loja lê só os números somados
alter table public.anuncios_cliques enable row level security;
alter table public.anuncios_impressoes enable row level security;
revoke all on public.anuncios_cliques, public.anuncios_impressoes from anon, authenticated;
grant select on public.anuncios_cliques, public.anuncios_impressoes to authenticated;
drop policy if exists "Equipe vê os cliques" on public.anuncios_cliques;
drop policy if exists "Equipe vê as impressões" on public.anuncios_impressoes;
create policy "Equipe vê os cliques" on public.anuncios_cliques for select to authenticated using ((select privado.eh_equipe()));
create policy "Equipe vê as impressões" on public.anuncios_impressoes for select to authenticated using ((select privado.eh_equipe()));

-- ------------------------------------------------------------------ a oficina da sessão

/** A oficina em nome de quem a vitrine registra: a pedida (se for da pessoa) ou a primeira ativa dela. */
create or replace function privado.oficina_da_vitrine(p_oficina uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v uuid;
begin
  if auth.uid() is null then
    return null;
  end if;
  if p_oficina is not null then
    select m.oficina_id into v from public.oficina_membros m join public.oficinas o on o.id = m.oficina_id and o.ativa
     where m.user_id = auth.uid() and m.oficina_id = p_oficina;
    return v;
  end if;
  select m.oficina_id into v from public.oficina_membros m join public.oficinas o on o.id = m.oficina_id and o.ativa
   where m.user_id = auth.uid() order by m.criado_em limit 1;
  return v;
end;
$$;

revoke all on function privado.oficina_da_vitrine(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ registrar

/**
 * Clique num anúncio. Uma vez por oficina por anúncio por dia. No anúncio por clique, cobra o valor
 * do clique enquanto couber no teto do dia; depois disso registra sem custo e avisa que esgotou.
 */
create or replace function public.registrar_clique(p_impulso bigint, p_oficina uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_oficina uuid := privado.oficina_da_vitrine(p_oficina);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_imp public.impulsos%rowtype;
  v_gasto numeric(10, 2) := 0;
  v_custo numeric(10, 2) := 0;
  v_id bigint;
begin
  if v_oficina is null then
    raise exception 'Só oficinas registram cliques' using errcode = '42501';
  end if;
  -- trava o anúncio: dois cliques ao mesmo tempo não passam do teto
  select * into v_imp from public.impulsos
   where id = p_impulso and status = 'ativo' and v_hoje between inicio and fim
   for update;
  if not found then
    return jsonb_build_object('registrado', false, 'motivo', 'fora_do_ar');
  end if;
  if v_imp.cpc is not null then
    select coalesce(sum(custo), 0) into v_gasto from public.anuncios_cliques where impulso_id = p_impulso and dia = v_hoje;
    if v_gasto + v_imp.cpc <= v_imp.orcamento_diario then
      v_custo := v_imp.cpc;
    end if;
  end if;
  insert into public.anuncios_cliques (impulso_id, oficina_id, dia, custo)
  values (p_impulso, v_oficina, v_hoje, v_custo)
  on conflict (impulso_id, oficina_id, dia) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('registrado', false, 'motivo', 'repetido');
  end if;
  return jsonb_build_object(
    'registrado', true,
    'cobrado', v_custo,
    'esgotado', v_imp.cpc is not null and v_gasto + v_custo + v_imp.cpc > v_imp.orcamento_diario
  );
end;
$$;

/** A vitrine mostrou estes anúncios à oficina (conta uma vez por oficina por dia). */
create or replace function public.registrar_impressoes(p_impulsos bigint[], p_oficina uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_oficina uuid := privado.oficina_da_vitrine(p_oficina);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_n integer;
begin
  if v_oficina is null then
    raise exception 'Só oficinas registram impressões' using errcode = '42501';
  end if;
  if coalesce(array_length(p_impulsos, 1), 0) > 50 then
    raise exception 'Muitos anúncios de uma vez' using errcode = '22023';
  end if;
  insert into public.anuncios_impressoes (impulso_id, oficina_id, dia)
  select i.id, v_oficina, v_hoje
    from public.impulsos i
   where i.id = any (p_impulsos) and i.status = 'ativo' and v_hoje between i.inicio and i.fim
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

/** Dos anúncios dados, os que ainda podem aparecer hoje (no ar e, se por clique, com teto sobrando). */
create or replace function public.anuncios_com_orcamento(p_impulsos bigint[])
returns bigint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(i.id order by i.id), '{}')
    from public.impulsos i
   where i.id = any (p_impulsos[1:200])
     and i.status = 'ativo'
     and (now() at time zone 'America/Sao_Paulo')::date between i.inicio and i.fim
     and (i.cpc is null or coalesce((select sum(c.custo) from public.anuncios_cliques c
                                       where c.impulso_id = i.id and c.dia = (now() at time zone 'America/Sao_Paulo')::date), 0) + i.cpc <= i.orcamento_diario);
$$;

/**
 * Os números dos anúncios da loja nos últimos dias: oficinas que viram, cliques e custo, no
 * período e hoje. Só somas: a loja não vê quais oficinas viram ou clicaram.
 */
create or replace function public.metricas_dos_anuncios(p_fornecedor bigint, p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_desde date := v_hoje - (least(greatest(coalesce(p_dias, 30), 1), 365) - 1);
begin
  if privado.papel_no_fornecedor(p_fornecedor) is null and not privado.eh_equipe() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'impulsoId', i.id,
             'impressoes', (select count(*) from public.anuncios_impressoes x where x.impulso_id = i.id and x.dia >= v_desde),
             'cliques', (select count(*) from public.anuncios_cliques c where c.impulso_id = i.id and c.dia >= v_desde),
             'custo', (select coalesce(sum(c.custo), 0) from public.anuncios_cliques c where c.impulso_id = i.id and c.dia >= v_desde),
             'impressoesHoje', (select count(*) from public.anuncios_impressoes x where x.impulso_id = i.id and x.dia = v_hoje),
             'cliquesHoje', (select count(*) from public.anuncios_cliques c where c.impulso_id = i.id and c.dia = v_hoje),
             'custoHoje', (select coalesce(sum(c.custo), 0) from public.anuncios_cliques c where c.impulso_id = i.id and c.dia = v_hoje)
           ) order by i.id desc)
      from public.impulsos i
     where i.fornecedor_id = p_fornecedor and (i.status = 'ativo' or i.fim >= v_desde)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.registrar_clique(bigint, uuid), public.registrar_impressoes(bigint[], uuid), public.anuncios_com_orcamento(bigint[]), public.metricas_dos_anuncios(bigint, integer) from public, anon;
grant execute on function public.registrar_clique(bigint, uuid), public.registrar_impressoes(bigint[], uuid), public.metricas_dos_anuncios(bigint, integer) to authenticated;
grant execute on function public.anuncios_com_orcamento(bigint[]) to anon, authenticated;

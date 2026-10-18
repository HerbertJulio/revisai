-- NPS: "de 0 a 10, quanto você indicaria o Revisaí para outra oficina?". Quem é de uma oficina
-- (ou de uma loja) responde pelo app, no máximo uma vez a cada 60 dias; ninguém lê as respostas
-- direto da tabela, só a equipe, pelo resumo (nps_resumo). O app pergunta depois de 30 dias na
-- oficina e de novo a cada 90 (respondendo ou dispensando). As conferências de permissão usam
-- coalesce (um papel NULL não pula o erro). Pode rodar de novo sem estragar nada.

create table if not exists public.nps_respostas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  oficina_id uuid references public.oficinas (id) on delete set null,
  fornecedor_id bigint references public.fornecedores (id) on delete set null,
  nota smallint not null check (nota between 0 and 10),
  comentario text check (char_length(comentario) <= 1000),
  criado_em timestamptz not null default now()
);

comment on table public.nps_respostas is 'Respostas do NPS. Só entram pela função nps_responder e só a equipe lê, pelo nps_resumo.';

create index if not exists nps_respostas_criado_idx on public.nps_respostas (criado_em desc);
create index if not exists nps_respostas_user_idx on public.nps_respostas (user_id, criado_em desc);
alter table public.nps_respostas enable row level security;
drop policy if exists "Ninguém pela API" on public.nps_respostas;
create policy "Ninguém pela API" on public.nps_respostas as restrictive for all to public using (false) with check (false);
revoke all on public.nps_respostas from public, anon, authenticated;

-- quem dispensou a pergunta (volta a perguntar depois de 90 dias)
create table if not exists privado.nps_dispensas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dispensado_em timestamptz not null default now()
);
alter table privado.nps_dispensas enable row level security;
drop policy if exists "Ninguém pela API" on privado.nps_dispensas;
create policy "Ninguém pela API" on privado.nps_dispensas as restrictive for all to public using (false) with check (false);
revoke all on privado.nps_dispensas from public, anon, authenticated;

/**
 * Guarda a resposta de quem entrou, pela oficina ou pela loja de que a pessoa é membro.
 * Uma por pessoa a cada 60 dias (RV091 quando já respondeu). O comentário vai até 1000 letras.
 */
create or replace function public.nps_responder(p_nota integer, p_comentario text default null, p_oficina uuid default null, p_fornecedor bigint default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ultima timestamptz;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  if p_nota is null or p_nota < 0 or p_nota > 10 then
    raise exception 'A nota vai de 0 a 10' using errcode = '22023';
  end if;
  if (p_oficina is null) = (p_fornecedor is null) then
    raise exception 'Responda pela oficina ou pela loja' using errcode = '22023';
  end if;
  if p_oficina is not null and coalesce(privado.papel_na_oficina(p_oficina), '') = '' then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if p_fornecedor is not null and coalesce(privado.papel_no_fornecedor(p_fornecedor), '') = '' then
    raise exception 'Você não é desta loja' using errcode = '42501';
  end if;
  -- duas abas respondendo juntas: uma espera a outra
  perform pg_advisory_xact_lock(hashtextextended('nps:' || v_uid::text, 0));
  select max(r.criado_em) into v_ultima from public.nps_respostas r where r.user_id = v_uid;
  if v_ultima is not null and v_ultima > now() - interval '60 days' then
    raise exception 'Você já respondeu há pouco' using errcode = 'RV091';
  end if;
  insert into public.nps_respostas (user_id, oficina_id, fornecedor_id, nota, comentario)
  values (v_uid, p_oficina, p_fornecedor, p_nota, nullif(left(btrim(coalesce(p_comentario, '')), 1000), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

/** Não quer responder agora: a pergunta volta em 90 dias (só para quem é de uma oficina ou loja). */
create or replace function public.nps_dispensar()
returns void
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
  if not exists (select 1 from public.oficina_membros m where m.user_id = v_uid)
     and not exists (select 1 from public.fornecedor_membros f where f.user_id = v_uid) then
    raise exception 'Só quem é de uma oficina ou de uma loja responde' using errcode = '42501';
  end if;
  insert into privado.nps_dispensas as d (user_id, dispensado_em) values (v_uid, now())
  on conflict (user_id) do update set dispensado_em = excluded.dispensado_em;
end;
$$;

/**
 * Se o app pergunta agora para quem entrou, nesta oficina: depois de 30 dias como membro dela e
 * 90 depois da última resposta ou dispensa. Quem não é da oficina recebe 42501.
 */
create or replace function public.nps_pendente(p_oficina uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_desde timestamptz;
  v_resposta timestamptz;
  v_dispensa timestamptz;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  select m.criado_em into v_desde from public.oficina_membros m where m.oficina_id = p_oficina and m.user_id = v_uid;
  if v_desde is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  select max(r.criado_em) into v_resposta from public.nps_respostas r where r.user_id = v_uid;
  select d.dispensado_em into v_dispensa from privado.nps_dispensas d where d.user_id = v_uid;
  return jsonb_build_object(
    'perguntar', v_desde <= now() - interval '30 days'
      and coalesce(v_resposta <= now() - interval '90 days', true)
      and coalesce(v_dispensa <= now() - interval '90 days', true),
    'membroDesde', v_desde,
    'ultimaResposta', v_resposta,
    'ultimaDispensa', v_dispensa
  );
end;
$$;

/**
 * O resumo para a equipe (qualquer papel): o NPS dos últimos meses (fuso de Brasília), mês a mês,
 * quantos de cada nota e os comentários mais novos com o nome da oficina ou da loja.
 */
create or replace function public.nps_resumo(p_meses integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_meses integer := least(greatest(coalesce(p_meses, 12), 1), 36);
  v_inicio timestamp := date_trunc('month', now() at time zone 'America/Sao_Paulo') - make_interval(months => v_meses - 1);
  v_desde timestamptz := v_inicio at time zone 'America/Sao_Paulo';
  v_res jsonb;
begin
  if not coalesce(privado.eh_equipe(), false) then
    raise exception 'Só a equipe' using errcode = '42501';
  end if;
  with r as (
    select n.nota, n.comentario, n.criado_em, n.oficina_id, n.fornecedor_id,
           to_char(n.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes
      from public.nps_respostas n
     where n.criado_em >= v_desde
  ),
  meses as (
    select to_char(m, 'YYYY-MM') as mes
      from generate_series(v_inicio, date_trunc('month', now() at time zone 'America/Sao_Paulo'), interval '1 month') m
  ),
  por_mes as (
    select m.mes,
           count(r.nota) as respostas,
           count(r.nota) filter (where r.nota >= 9) as promotores,
           count(r.nota) filter (where r.nota between 7 and 8) as neutros,
           count(r.nota) filter (where r.nota <= 6) as detratores
      from meses m left join r on r.mes = m.mes
     group by m.mes
  )
  select jsonb_build_object(
    'total', (
      select jsonb_build_object(
        'respostas', count(*),
        'promotores', count(*) filter (where nota >= 9),
        'neutros', count(*) filter (where nota between 7 and 8),
        'detratores', count(*) filter (where nota <= 6),
        'nps', case when count(*) > 0 then round(100.0 * (count(*) filter (where nota >= 9) - count(*) filter (where nota <= 6)) / count(*))::integer end
      ) from r
    ),
    'meses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mes', p.mes, 'respostas', p.respostas, 'promotores', p.promotores, 'neutros', p.neutros, 'detratores', p.detratores,
        'nps', case when p.respostas > 0 then round(100.0 * (p.promotores - p.detratores) / p.respostas)::integer end
      ) order by p.mes)
        from por_mes p
    ), '[]'::jsonb),
    'notas', coalesce((
      select jsonb_agg(jsonb_build_object('nota', x.nota, 'respostas', x.n) order by x.nota)
        from (select r.nota, count(*) as n from r group by r.nota) x
    ), '[]'::jsonb),
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object('nota', c.nota, 'comentario', c.comentario, 'criadoEm', c.criado_em, 'oficina', c.oficina, 'loja', c.loja) order by c.criado_em desc)
        from (
          select r.nota, r.comentario, r.criado_em, o.nome as oficina, f.nome as loja
            from r
            left join public.oficinas o on o.id = r.oficina_id
            left join public.fornecedores f on f.id = r.fornecedor_id
           where r.comentario is not null
           order by r.criado_em desc
           limit 50
        ) c
    ), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

revoke all on function public.nps_responder(integer, text, uuid, bigint), public.nps_dispensar(), public.nps_pendente(uuid), public.nps_resumo(integer) from public, anon, authenticated;
grant execute on function public.nps_responder(integer, text, uuid, bigint), public.nps_dispensar(), public.nps_pendente(uuid), public.nps_resumo(integer) to authenticated;

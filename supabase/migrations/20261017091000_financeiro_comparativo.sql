-- "Sua oficina contra a média": o comparativo grátis com as oficinas da região (a página pública
-- /comparativo e o relatório da oficina). Só números somados das oficinas com conta e ativas da
-- mesma cidade (ou do estado, quando a cidade tem menos de 5), dos últimos 90 dias:
-- - cada número precisa de pelo menos 5 oficinas, senão sai vazio; menos de 5 no estado, nada;
-- - vai com um pouco de ruído, o mesmo o dia todo (pedir de novo não ajuda a tirar o ruído);
-- - nunca sai id, nome ou contagem exata de oficinas (só "5 ou mais", "10 ou mais"...).
-- As contas de cada oficina ficam guardadas por estado (privado.comparativo_base, sem o id da
-- oficina) e são refeitas no máximo a cada 6 horas: quem chama sem conta não faz o banco varrer
-- os registros de todas as oficinas a cada pedido.

create table if not exists privado.comparativo_base (
  id bigint generated always as identity primary key,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  cidade text not null default '',
  ticket numeric,
  troca_oleo numeric,
  carros_mes numeric,
  aprovacao numeric
);
create index if not exists comparativo_base_uf_idx on privado.comparativo_base (uf, cidade);

create table if not exists privado.comparativo_calculos (
  uf text primary key check (uf ~ '^[A-Z]{2}$'),
  calculado_em timestamptz not null default now()
);

alter table privado.comparativo_base enable row level security;
alter table privado.comparativo_calculos enable row level security;
drop policy if exists "Ninguém pela API" on privado.comparativo_base;
create policy "Ninguém pela API" on privado.comparativo_base as restrictive for all to public using (false) with check (false);
drop policy if exists "Ninguém pela API" on privado.comparativo_calculos;
create policy "Ninguém pela API" on privado.comparativo_calculos as restrictive for all to public using (false) with check (false);
revoke all on privado.comparativo_base, privado.comparativo_calculos from public, anon, authenticated;

comment on table privado.comparativo_base is 'Os números de cada oficina com conta (sem o id dela) para o comparativo da região. Refeito a cada 6 horas por estado; só sai somado, com ruído, em grupos de 5 ou mais.';

/** "São João de Meriti " e "sao joao de meriti" são a mesma cidade. */
create or replace function privado.cidade_normalizada(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    lower(translate(coalesce(p, ''),
      'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
      'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY')),
    '[^a-z0-9]+', ' ', 'g'));
$$;

/** Um número de -1 a 1, sempre o mesmo para a mesma semente. */
create or replace function privado.ruido(p_semente text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select ((('x' || substr(md5(p_semente), 1, 8))::bit(32)::bigint & 2147483647)::numeric / 2147483647) * 2 - 1;
$$;

/**
 * Refaz os números de cada oficina com conta do estado. Lê os documentos (orçamentos e ordens)
 * sem confiar no formato: número só quando é número, data comparada como texto ('AAAA-MM-DD'),
 * para que um registro estragado não derrube a conta de todo mundo.
 */
create or replace function privado.comparativo_calcular(p_uf text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hoje text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_desde text := to_char((now() at time zone 'America/Sao_Paulo')::date - 90, 'YYYY-MM-DD');
begin
  delete from privado.comparativo_base where uf = p_uf;

  with ofs as (
    select o.id, privado.cidade_normalizada(o.cidade) as cidade
      from public.oficinas o
     where o.uf = p_uf and o.ativa and o.excluir_em is null
       -- oficina com menos de 30 dias não entra (oficinas de mentira não furam o mínimo de 5 na hora)
       and o.criado_em < now() - interval '30 days'
  ),
  docs as (
    select r.oficina_id, r.dados
      from ofs join public.registros r on r.oficina_id = ofs.id
     where r.colecao = 'documentos' and not r.apagado
  ),
  ordens as (
    select d.oficina_id,
           d.dados ->> 'veiculoId' as veiculo,
           case when jsonb_typeof(d.dados -> 'desconto') = 'number' then (d.dados ->> 'desconto')::numeric else 0 end as desconto,
           l.subtotal,
           l.oleo
      from docs d
      cross join lateral (
        select coalesce(sum(round(x.q * x.v, 2)), 0) as subtotal,
               sum(round(x.q * x.v, 2)) filter (where x.servico = 'troca_oleo') as oleo
          from (
            select case when jsonb_typeof(e -> 'quantidade') = 'number' then (e ->> 'quantidade')::numeric end as q,
                   case when jsonb_typeof(e -> 'valorUnitario') = 'number' then (e ->> 'valorUnitario')::numeric end as v,
                   e ->> 'servico' as servico
              from jsonb_array_elements(case when jsonb_typeof(d.dados -> 'linhas') = 'array' then d.dados -> 'linhas' else '[]'::jsonb end) e
             where jsonb_typeof(e) = 'object' and coalesce(e -> 'recusada', 'false'::jsonb) <> 'true'::jsonb
          ) x
         where x.q between 0 and 100000 and x.v between -1000000 and 1000000
      ) l
     where d.dados ->> 'tipo' = 'ordem'
       and d.dados ->> 'situacao' = 'concluida'
       and coalesce(left(d.dados ->> 'concluidoEm', 10), d.dados ->> 'data') between v_desde and v_hoje
  ),
  totais as (
    select o.oficina_id, o.veiculo, o.oleo,
           greatest(0, o.subtotal - least(greatest(o.desconto, 0), greatest(o.subtotal, 0))) as total
      from ordens o
  ),
  por_oficina as (
    select t.oficina_id,
           count(*) as ordens,
           avg(t.total) as ticket,
           count(*) filter (where t.oleo > 0) as ordens_oleo,
           avg(t.oleo) filter (where t.oleo > 0) as troca_oleo,
           count(distinct t.veiculo) / 3.0 as carros_mes
      from totais t
     where t.total <= 500000
     group by t.oficina_id
  ),
  orcamentos as (
    select d.oficina_id,
           count(*) as mostrados,
           count(*) filter (where d.dados ->> 'situacao' = 'aprovado') as aprovados
      from docs d
     where d.dados ->> 'tipo' = 'orcamento'
       and d.dados ->> 'situacao' in ('enviado', 'aprovado', 'recusado')
       and coalesce(left(d.dados ->> 'enviadoEm', 10), d.dados ->> 'data') between v_desde and v_hoje
     group by d.oficina_id
  )
  insert into privado.comparativo_base (uf, cidade, ticket, troca_oleo, carros_mes, aprovacao)
  select p_uf,
         ofs.cidade,
         -- uma oficina só entra num número com movimento suficiente (uma ordem de teste não conta)
         case when p.ordens >= 3 then round(p.ticket, 2) end,
         case when p.ordens_oleo >= 2 then round(p.troca_oleo, 2) end,
         case when p.ordens >= 3 then round(p.carros_mes, 2) end,
         case when o.mostrados >= 3 then round(100.0 * o.aprovados / o.mostrados, 2) end
    from ofs
    left join por_oficina p on p.oficina_id = ofs.id
    left join orcamentos o on o.oficina_id = ofs.id
   where coalesce(p.ordens, 0) >= 3 or coalesce(o.mostrados, 0) >= 3;

  insert into privado.comparativo_calculos (uf, calculado_em) values (p_uf, now())
  on conflict (uf) do update set calculado_em = excluded.calculado_em;
end;
$$;

/**
 * Primeiro quarto, meio e último quarto de um número, com ruído e arredondado (dinheiro de 5 em 5
 * reais acima de R$ 100). Menos de 5 oficinas: null.
 */
create or replace function privado.comparativo_faixa(p_valores numeric[], p_metrica text, p_semente text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n integer := coalesce(cardinality(p_valores), 0);
  v_q double precision[];
  v_r numeric[] := '{}';
  v_x numeric;
  v_ruido numeric;
begin
  if v_n < 5 then
    return null;
  end if;
  select percentile_cont(array[0.25, 0.5, 0.75]) within group (order by x) into v_q from unnest(p_valores) x;
  for i in 1..3 loop
    v_x := v_q[i]::numeric;
    v_ruido := privado.ruido(p_semente || '|' || p_metrica || '|' || i);
    if p_metrica = 'aprovacao' then
      v_x := least(100, greatest(0, round(v_x + 2 * v_ruido)));
    elsif p_metrica = 'carrosMes' then
      v_x := v_x * (1 + 0.04 * v_ruido);
      v_x := greatest(0, case when v_x < 10 then round(v_x, 1) else round(v_x) end);
    else
      v_x := v_x * (1 + 0.03 * v_ruido);
      v_x := greatest(0, case when v_x >= 100 then round(v_x / 5) * 5 else round(v_x) end);
    end if;
    v_r := v_r || v_x;
  end loop;
  -- o ruído não pode trocar a ordem dos três
  select array_agg(x order by x) into v_r from unnest(v_r) x;
  return jsonb_build_object('p25', v_r[1], 'mediana', v_r[2], 'p75', v_r[3], 'oficinas', (v_n / 5) * 5);
end;
$$;

revoke all on function privado.cidade_normalizada(text), privado.ruido(text), privado.comparativo_calcular(text), privado.comparativo_faixa(numeric[], text, text) from public, anon, authenticated;

/**
 * A faixa (primeiro quarto, meio e último quarto) do ticket médio das ordens concluídas, do preço
 * da troca de óleo, dos carros atendidos por mês e da % de orçamentos aprovados, nas oficinas com
 * conta da cidade (5 ou mais) ou do estado (5 ou mais). Menos que isso no estado: null.
 * Qualquer um chama (a página pública não tem conta); nada do que volta identifica uma oficina.
 */
create or replace function public.comparativo_da_regiao(p_uf text, p_cidade text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_minimo constant integer := 5;
  v_uf text := upper(trim(coalesce(p_uf, '')));
  v_cidade text := privado.cidade_normalizada(left(coalesce(p_cidade, ''), 80));
  v_dia text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_nivel text;
  v_n integer := 0;
  v_res jsonb;
begin
  if v_uf !~ '^[A-Z]{2}$' then
    return null;
  end if;
  -- um pedido por vez refaz o estado; os outros esperam e usam a conta pronta
  perform pg_advisory_xact_lock(hashtextextended('comparativo:' || v_uf, 0));
  if not exists (select 1 from privado.comparativo_calculos c where c.uf = v_uf and c.calculado_em > now() - interval '6 hours') then
    perform privado.comparativo_calcular(v_uf);
  end if;

  if v_cidade <> '' then
    select count(*) into v_n from privado.comparativo_base b where b.uf = v_uf and b.cidade = v_cidade;
  end if;
  if v_n >= v_minimo then
    v_nivel := 'cidade';
  else
    select count(*) into v_n from privado.comparativo_base b where b.uf = v_uf;
    if v_n < v_minimo then
      return null;
    end if;
    v_nivel := 'uf';
  end if;

  select jsonb_build_object(
           'nivel', v_nivel,
           'uf', v_uf,
           'cidade', case when v_nivel = 'cidade' then nullif(trim(left(p_cidade, 80)), '') end,
           'oficinas', (count(*) / 5) * 5,
           'dias', 90,
           'ticket', privado.comparativo_faixa(array_agg(b.ticket) filter (where b.ticket is not null), 'ticket', v_dia || '|' || v_uf || '|' || case when v_nivel = 'cidade' then v_cidade else '' end),
           'trocaOleo', privado.comparativo_faixa(array_agg(b.troca_oleo) filter (where b.troca_oleo is not null), 'trocaOleo', v_dia || '|' || v_uf || '|' || case when v_nivel = 'cidade' then v_cidade else '' end),
           'carrosMes', privado.comparativo_faixa(array_agg(b.carros_mes) filter (where b.carros_mes is not null), 'carrosMes', v_dia || '|' || v_uf || '|' || case when v_nivel = 'cidade' then v_cidade else '' end),
           'aprovacao', privado.comparativo_faixa(array_agg(b.aprovacao) filter (where b.aprovacao is not null), 'aprovacao', v_dia || '|' || v_uf || '|' || case when v_nivel = 'cidade' then v_cidade else '' end)
         )
    into v_res
    from privado.comparativo_base b
   where b.uf = v_uf and (v_nivel = 'uf' or b.cidade = v_cidade);
  return v_res;
end;
$$;

/** Refaz as contas de todos os estados (para a rotina diária do servidor, com a chave do sistema). */
create or replace function public.comparativo_atualizar()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uf text;
  v_n integer := 0;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  for v_uf in select distinct o.uf from public.oficinas o where o.uf is not null and o.ativa loop
    perform pg_advisory_xact_lock(hashtextextended('comparativo:' || v_uf, 0));
    perform privado.comparativo_calcular(v_uf);
    v_n := v_n + 1;
  end loop;
  -- estados que ficaram sem oficina não guardam contas velhas
  delete from privado.comparativo_base b where not exists (select 1 from public.oficinas o where o.uf = b.uf and o.ativa);
  delete from privado.comparativo_calculos c where not exists (select 1 from public.oficinas o where o.uf = c.uf and o.ativa);
  return v_n;
end;
$$;

revoke all on function public.comparativo_da_regiao(text, text), public.comparativo_atualizar() from public;
grant execute on function public.comparativo_da_regiao(text, text) to anon, authenticated;
grant execute on function public.comparativo_atualizar() to anon;

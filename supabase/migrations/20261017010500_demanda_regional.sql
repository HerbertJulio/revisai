-- A demanda da região para as lojas, somada no banco: só oficinas com conta e ativas, só linhas
-- com pelo menos 5 oficinas, e com um pouco de ruído nas quantidades (muda a cada dia), para que
-- ninguém descubra a previsão de uma oficina mandando previsões falsas e comparando.

create or replace function public.demanda_da_regiao(p_uf text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_minimo integer := 5;
  v_dia text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_oficinas integer;
  v_res jsonb;
begin
  if not (exists (select 1 from public.fornecedor_membros m where m.user_id = auth.uid()) or privado.eh_equipe()) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_uf !~ '^[A-Z]{2}$' then
    return null;
  end if;
  select count(*) into v_oficinas
    from public.demandas d join public.oficinas o on o.id = d.oficina_id and o.ativa
   where d.uf = p_uf and d.atualizado_em > now() - interval '10 days';
  with recentes as (
    select d.oficina_id, d.itens
      from public.demandas d join public.oficinas o on o.id = d.oficina_id and o.ativa
     where d.uf = p_uf and d.atualizado_em > now() - interval '10 days'
  ),
  itens as (
    select r.oficina_id,
           i ->> 'categoria' as categoria,
           regexp_replace(trim(i ->> 'titulo'), '\s+', ' ', 'g') as titulo,
           i ->> 'unidade' as unidade,
           greatest(coalesce((i ->> 'quantidade')::numeric, 0), 0) as quantidade,
           greatest(coalesce((i ->> 'carros')::integer, 0), 0) as carros
      from recentes r, jsonb_array_elements(r.itens) i
     where jsonb_typeof(r.itens) = 'array'
  ),
  linhas as (
    select categoria, min(titulo) as titulo, unidade, sum(quantidade) as quantidade, sum(carros) as carros, count(distinct oficina_id) as oficinas
      from itens
     group by categoria, lower(titulo), unidade
  ),
  com_ruido as (
    select l.*,
           -- de 0,9 a 1,1, igual o dia todo para a mesma linha
           0.9 + 0.2 * ((('x' || substr(md5(l.categoria || '|' || lower(l.titulo) || '|' || v_dia), 1, 8))::bit(32)::bigint & 2147483647)::numeric / 2147483647) as fator
      from linhas l
  )
  select jsonb_build_object(
    'uf', p_uf,
    'oficinas', v_oficinas,
    'minimo', v_minimo,
    'linhas', coalesce(jsonb_agg(jsonb_build_object(
        'categoria', categoria,
        'titulo', titulo,
        'unidade', unidade,
        'quantidade', case when unidade = 'L' then round(quantidade * fator) else round(quantidade * fator) end,
        'carros', case when carros >= 10 then (round(carros * fator / 5.0) * 5)::integer else greatest(round(carros * fator)::integer, 1) end,
        'oficinas', oficinas
      ) order by carros desc, titulo) filter (where oficinas >= v_minimo and v_oficinas >= v_minimo), '[]'::jsonb),
    'escondidas', count(*) filter (where oficinas < v_minimo or v_oficinas < v_minimo)
  )
  into v_res
  from com_ruido;
  return coalesce(v_res, jsonb_build_object('uf', p_uf, 'oficinas', v_oficinas, 'minimo', v_minimo, 'linhas', '[]'::jsonb, 'escondidas', 0));
end;
$$;

revoke all on function public.demanda_da_regiao(text) from public, anon;
grant execute on function public.demanda_da_regiao(text) to authenticated;

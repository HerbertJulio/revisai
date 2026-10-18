-- Numeração dos orçamentos e das ordens com vários aparelhos. Dois aparelhos sem internet podem
-- dar o mesmo número a documentos diferentes; ao gravar, o banco confere: se o número já é de
-- outro documento vivo do mesmo tipo, o que chegou depois ganha o próximo número livre (o
-- aparelho recebe o número novo na próxima busca). O número de um documento já gravado não muda
-- (um aparelho atrasado que manda o número antigo não troca o que o banco deu). O contador
-- (config/contadores) nunca fica abaixo do maior número em uso, para o próximo documento não
-- repetir um número.
-- Pode rodar de novo (tudo é create or replace / if not exists).

/** O número inteiro positivo de um valor JSON (ou null, se não for um). */
create or replace function privado.numero_inteiro(p jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'number' and (p #>> '{}') ~ '^[0-9]{1,15}$' then (p #>> '{}')::bigint end;
$$;

-- a conferência de número repetido usa este índice (só os documentos vivos)
create index if not exists registros_documentos_numero_idx on public.registros (oficina_id, (dados ->> 'tipo'), (dados ->> 'numero'))
  where colecao = 'documentos' and not apagado;

/** Outro documento vivo do mesmo tipo já tem este número? */
create or replace function privado.numero_em_uso(p_oficina uuid, p_tipo text, p_numero bigint, p_fora text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.registros r
    where r.oficina_id = p_oficina and r.colecao = 'documentos' and not r.apagado
      and r.dados ->> 'tipo' = p_tipo and r.dados ->> 'numero' = p_numero::text and r.id <> p_fora
  );
$$;

/** O maior número em uso no tipo (fora o próprio documento) ou o do contador, o que for maior. */
create or replace function privado.maior_numero(p_oficina uuid, p_tipo text, p_fora text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce((
      select max(privado.numero_inteiro(r.dados -> 'numero')) from public.registros r
      where r.oficina_id = p_oficina and r.colecao = 'documentos' and not r.apagado
        and r.dados ->> 'tipo' = p_tipo and r.id <> p_fora
    ), 0),
    coalesce((
      select privado.numero_inteiro(c.dados -> p_tipo) from public.registros c
      where c.oficina_id = p_oficina and c.colecao = 'config' and c.id = 'contadores' and not c.apagado
    ), 0)
  );
$$;

/** O contador com cada tipo pelo menos no maior número em uso (só sobe). */
create or replace function privado.contadores_corrigidos(p_oficina uuid, p_dados jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  l record;
begin
  for l in
    select r.dados ->> 'tipo' as tipo, max(privado.numero_inteiro(r.dados -> 'numero')) as maior
    from public.registros r
    where r.oficina_id = p_oficina and r.colecao = 'documentos' and not r.apagado and r.dados ->> 'tipo' ~ '^[a-z]{1,30}$'
    group by 1
  loop
    if l.maior is not null and l.maior > coalesce(privado.numero_inteiro(v -> l.tipo), 0) then
      v := jsonb_set(v, array[l.tipo], to_jsonb(l.maior));
    end if;
  end loop;
  return v;
end;
$$;

create or replace function privado.registros_numeracao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_numero bigint;
  v_antigo bigint;
begin
  if new.apagado then
    return new;
  end if;
  -- uma gravação por vez em cada oficina: duas ao mesmo tempo não pegam o mesmo número livre
  -- (e o cadeado vem antes da linha do contador, para as duas não ficarem esperando uma a outra)
  perform pg_advisory_xact_lock(hashtextextended('revisai:numeracao:' || new.oficina_id::text, 0));

  if new.colecao = 'config' then
    new.dados := privado.contadores_corrigidos(new.oficina_id, new.dados);
    return new;
  end if;

  -- insert ... on conflict que vai virar atualização: quem confere é a atualização
  if tg_op = 'INSERT' and exists (select 1 from public.registros r where r.oficina_id = new.oficina_id and r.colecao = new.colecao and r.id = new.id) then
    return new;
  end if;
  v_tipo := new.dados ->> 'tipo';
  if v_tipo is null or v_tipo !~ '^[a-z]{1,30}$' then
    return new;
  end if;
  v_numero := privado.numero_inteiro(new.dados -> 'numero');
  if tg_op = 'UPDATE' and not old.apagado and old.dados ->> 'tipo' = v_tipo then
    -- o número que o banco já deu fica (a cópia atrasada de um aparelho manda o antigo)
    v_antigo := privado.numero_inteiro(old.dados -> 'numero');
    if v_antigo is not null and v_antigo > 0 and not privado.numero_em_uso(new.oficina_id, v_tipo, v_antigo, new.id) then
      v_numero := v_antigo;
    end if;
  end if;
  if v_numero is null or v_numero < 1 or privado.numero_em_uso(new.oficina_id, v_tipo, v_numero, new.id) then
    v_numero := privado.maior_numero(new.oficina_id, v_tipo, new.id) + 1;
  end if;
  if privado.numero_inteiro(new.dados -> 'numero') is distinct from v_numero then
    new.dados := jsonb_set(new.dados, '{numero}', to_jsonb(v_numero));
  end if;

  -- o contador acompanha (também quando quem grava é o mecânico, que não muda a config)
  insert into public.registros as c (oficina_id, colecao, id, dados)
  values (new.oficina_id, 'config', 'contadores', jsonb_build_object(v_tipo, v_numero))
  on conflict (oficina_id, colecao, id) do update
    set dados = case when c.apagado then jsonb_build_object(v_tipo, v_numero) else jsonb_set(c.dados, array[v_tipo], to_jsonb(v_numero)) end,
        apagado = false
    where c.apagado or coalesce(privado.numero_inteiro(c.dados -> v_tipo), 0) < v_numero;
  return new;
end;
$$;

revoke all on function privado.numero_inteiro(jsonb) from public, anon, authenticated;
revoke all on function privado.numero_em_uso(uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function privado.maior_numero(uuid, text, text) from public, anon, authenticated;
revoke all on function privado.contadores_corrigidos(uuid, jsonb) from public, anon, authenticated;
revoke all on function privado.registros_numeracao() from public, anon, authenticated;

drop trigger if exists registros_numeracao on public.registros;
create trigger registros_numeracao before insert or update on public.registros
  for each row when (new.colecao = 'documentos' or (new.colecao = 'config' and new.id = 'contadores'))
  execute function privado.registros_numeracao();

-- documentos que já estavam repetidos antes desta regra: o mais novo de cada par ganha um
-- número livre (a atualização passa pela regra acima)
do $$
declare
  l record;
begin
  for l in
    select r.oficina_id, r.id
    from public.registros r
    where r.colecao = 'documentos' and not r.apagado
      and exists (
        select 1 from public.registros o
        where o.oficina_id = r.oficina_id and o.colecao = 'documentos' and not o.apagado and o.id <> r.id
          and o.dados ->> 'tipo' = r.dados ->> 'tipo' and o.dados ->> 'numero' = r.dados ->> 'numero'
          and (o.atualizado_em, o.id) < (r.atualizado_em, r.id)
      )
    order by r.oficina_id, r.atualizado_em, r.id
  loop
    update public.registros r set dados = jsonb_set(r.dados, '{numero}', 'null'::jsonb)
    where r.oficina_id = l.oficina_id and r.colecao = 'documentos' and r.id = l.id;
  end loop;
end;
$$;

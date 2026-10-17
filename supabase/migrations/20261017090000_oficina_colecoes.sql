-- Os cadastros novos da oficina entram como coleções dos registros: financeiro, agenda e
-- comissão, checklist de entrada, garantia, lembretes, clube de manutenção, fidelidade e recall.
-- O dinheiro (lançamentos e cobranças do clube) fica só para o dono e o gerente.

create or replace function privado.colecao_valida(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p = any (array[
    'config', 'clientes', 'veiculos', 'atendimentos', 'leituras', 'contatos', 'produtosProprios',
    'ordens', 'estoque', 'movimentos', 'documentos', 'pedidos',
    'lancamentos', 'agendamentos', 'profissionais', 'checklists', 'garantias', 'lembretes',
    'clubePlanos', 'clubeMembros', 'clubeCobrancas', 'fidelidade', 'recalls',
    'comissoes', 'clube'
  ]);
$$;

/** Coleções que o mecânico não vê nem grava. */
create or replace function privado.colecao_restrita(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p = any (array['lancamentos', 'clubeCobrancas']);
$$;
revoke all on function privado.colecao_restrita(text) from public, anon;
grant execute on function privado.colecao_restrita(text) to authenticated;

drop policy if exists "Membros leem os dados da oficina" on public.registros;
create policy "Membros leem os dados da oficina" on public.registros for select to authenticated
  using (
    oficina_id in (select privado.minhas_oficinas())
    and (not privado.colecao_restrita(colecao) or privado.papel_na_oficina(oficina_id) in ('dono', 'gerente'))
  );

/**
 * Grava um lote de registros da oficina (até 500). Cada item: {colecao, id, dados, apagado}.
 * Quem não é da oficina não grava nada. O mecânico não muda o cadastro, as preferências e o
 * financeiro. Devolve a versão de cada um (o último a gravar vence).
 */
create or replace function public.gravar_registros(p_oficina uuid, p_itens jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_papel text := privado.papel_na_oficina(p_oficina);
  v_item jsonb;
  v_res jsonb := '[]'::jsonb;
  v_colecao text;
  v_id text;
  v_versao bigint;
  v_total bigint;
begin
  if v_papel is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 500 then
    raise exception 'Lote inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.oficinas o where o.id = p_oficina and o.ativa) then
    raise exception 'Oficina desativada' using errcode = '42501';
  end if;
  select count(*) into v_total from public.registros r where r.oficina_id = p_oficina;
  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    v_colecao := v_item ->> 'colecao';
    v_id := v_item ->> 'id';
    if not privado.colecao_valida(v_colecao) or v_id is null or char_length(v_id) not between 1 and 100
       or jsonb_typeof(v_item -> 'dados') is distinct from 'object' then
      raise exception 'Item inválido' using errcode = '22023';
    end if;
    if pg_column_size(v_item -> 'dados') > 262144 then
      raise exception 'Item grande demais' using errcode = '22023';
    end if;
    if v_papel = 'mecanico' and (v_colecao = 'config' or privado.colecao_restrita(v_colecao)) then
      continue;
    end if;
    insert into public.registros as r (oficina_id, colecao, id, dados, apagado)
    values (p_oficina, v_colecao, v_id, v_item -> 'dados', coalesce((v_item ->> 'apagado')::boolean, false))
    on conflict (oficina_id, colecao, id) do update
      set dados = excluded.dados, apagado = excluded.apagado
    returning r.versao into v_versao;
    if v_versao = 1 then
      v_total := v_total + 1;
      if v_total > 300000 then
        raise exception 'Limite de dados da oficina' using errcode = 'P0001';
      end if;
    end if;
    v_res := v_res || jsonb_build_array(jsonb_build_object('colecao', v_colecao, 'id', v_id, 'versao', v_versao));
  end loop;
  return v_res;
end;
$$;

/**
 * O que mudou na oficina desde a marca `p_desde` (número de transação), em ordem, a partir
 * do cursor (p_colecao, p_id) quando a página anterior parou no meio de uma transação.
 * Devolve {itens, mais, marca}: `marca` é a menor transação que ainda pode estar aberta;
 * a próxima busca começa nela (repetir um item não faz mal; perder um faria).
 * O mecânico não recebe o financeiro.
 */
create or replace function public.ler_registros(p_oficina uuid, p_desde bigint default 0, p_colecao text default '', p_id text default '', p_limite integer default 1000)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limite, 1000), 1), 2000);
  v_itens jsonb;
  v_n integer;
  v_marca bigint := pg_snapshot_xmin(pg_current_snapshot())::text::bigint;
  v_papel text := privado.papel_na_oficina(p_oficina);
  v_tudo boolean;
begin
  if v_papel is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  v_tudo := v_papel in ('dono', 'gerente');
  select coalesce(jsonb_agg(jsonb_build_object('colecao', x.colecao, 'id', x.id, 'dados', case when x.apagado then null else x.dados end,
           'apagado', x.apagado, 'versao', x.versao, 'tx', x.tx) order by x.tx, x.colecao, x.id), '[]'::jsonb), count(*)
    into v_itens, v_n
    from (
      select r.colecao, r.id, r.dados, r.apagado, r.versao, r.tx
        from public.registros r
       where r.oficina_id = p_oficina
         and (r.tx, r.colecao, r.id) > (coalesce(p_desde, 0), coalesce(p_colecao, ''), coalesce(p_id, ''))
         and (v_tudo or not privado.colecao_restrita(r.colecao))
       order by r.tx, r.colecao, r.id
       limit v_lim
    ) x;
  return jsonb_build_object('itens', v_itens, 'mais', v_n >= v_lim, 'marca', v_marca);
end;
$$;

revoke all on function public.gravar_registros(uuid, jsonb), public.ler_registros(uuid, bigint, text, text, integer) from public, anon;
grant execute on function public.gravar_registros(uuid, jsonb), public.ler_registros(uuid, bigint, text, text, integer) to authenticated;

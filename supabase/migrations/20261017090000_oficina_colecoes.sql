-- Os cadastros novos da oficina entram como coleções dos registros: financeiro, agenda e
-- comissão, checklist de entrada, garantia, lembretes, clube de manutenção, fidelidade e recall.
-- O dinheiro fica só para o dono e o gerente, no banco e não só na tela: o mecânico não recebe
-- os lançamentos nem as cobranças do clube, recebe os profissionais sem a comissão, o estoque e
-- os movimentos sem o custo, os lembretes sem o valor e os planos do clube sem o preço, e não
-- muda nada disso. Cada oficina tem um teto de espaço e de gravações por hora.

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
  select p = any (array['lancamentos', 'clubeCobrancas', 'comissoes', 'clube']);
$$;
revoke all on function privado.colecao_restrita(text) from public, anon;
grant execute on function privado.colecao_restrita(text) to authenticated;

/** Coleções que o mecânico vê sem os campos de dinheiro (e não muda esses campos). */
create or replace function privado.colecao_com_dinheiro(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p = any (array['profissionais', 'estoque', 'movimentos', 'lembretes', 'clubePlanos']);
$$;
revoke all on function privado.colecao_com_dinheiro(text) from public, anon;
grant execute on function privado.colecao_com_dinheiro(text) to authenticated;

/** Os campos de dinheiro de cada coleção. */
create or replace function privado.campos_de_dinheiro(p text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'profissionais' then array['comissaoServicos', 'comissaoPecas']
    when 'estoque' then array['custo']
    when 'movimentos' then array['custoUnitario']
    when 'lembretes' then array['valorEstimado']
    when 'clubePlanos' then array['preco']
    else array[]::text[]
  end;
$$;

/** O que cada papel recebe de um registro: o dono e o gerente, tudo; o mecânico, sem o dinheiro. */
create or replace function privado.dados_para_papel(p_colecao text, p_dados jsonb, p_papel text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_dados is null or p_papel in ('dono', 'gerente') then p_dados
    else p_dados - privado.campos_de_dinheiro(p_colecao)
  end;
$$;

drop policy if exists "Membros leem os dados da oficina" on public.registros;
create policy "Membros leem os dados da oficina" on public.registros for select to authenticated
  using (
    oficina_id in (select privado.minhas_oficinas())
    and (
      coalesce(privado.papel_na_oficina(oficina_id), '') in ('dono', 'gerente')
      -- o mecânico lê direto só o que não tem dinheiro; o resto vem por ler_registros, já filtrado
      or (not privado.colecao_restrita(colecao) and not privado.colecao_com_dinheiro(colecao))
    )
  );

-- quanto cada oficina ocupa (o teto de espaço); a conta anda com cada gravação
create table if not exists privado.uso_dados (
  oficina_id uuid primary key references public.oficinas (id) on delete cascade,
  bytes bigint not null default 0
);
alter table privado.uso_dados enable row level security;
drop policy if exists "Ninguém pela API" on privado.uso_dados;
create policy "Ninguém pela API" on privado.uso_dados as restrictive for all to public using (false) with check (false);
revoke all on privado.uso_dados from public, anon, authenticated;

create or replace function privado.contar_uso_dados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oficina uuid := coalesce(new.oficina_id, old.oficina_id);
  v_delta bigint := coalesce(pg_column_size(new.dados), 0) - coalesce(pg_column_size(old.dados), 0);
begin
  if tg_op = 'DELETE' then
    v_delta := -coalesce(pg_column_size(old.dados), 0);
  elsif tg_op = 'INSERT' then
    v_delta := coalesce(pg_column_size(new.dados), 0);
  end if;
  if v_delta <> 0 and exists (select 1 from public.oficinas o where o.id = v_oficina) then
    insert into privado.uso_dados as u (oficina_id, bytes) values (v_oficina, greatest(v_delta, 0))
    on conflict (oficina_id) do update set bytes = greatest(u.bytes + v_delta, 0);
  end if;
  return null;
end;
$$;
revoke all on function privado.contar_uso_dados() from public, anon, authenticated;

drop trigger if exists registros_uso on public.registros;
create trigger registros_uso after insert or update of dados or delete on public.registros
  for each row execute function privado.contar_uso_dados();

-- o que já existe entra na conta uma vez
insert into privado.uso_dados (oficina_id, bytes)
select r.oficina_id, sum(pg_column_size(r.dados)) from public.registros r
 where exists (select 1 from public.oficinas o where o.id = r.oficina_id)
 group by r.oficina_id
on conflict (oficina_id) do update set bytes = excluded.bytes;

/** Soma `p_quanto` na janela de `p_segundos` da chave e diz se ainda cabe em `p_max` (uso interno). */
create or replace function privado.contar_limite(p_chave text, p_quanto integer, p_max integer, p_segundos integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_janela bigint := floor(extract(epoch from now()) / greatest(p_segundos, 1))::bigint;
  v_n integer;
begin
  insert into privado.limites as l (chave, janela, n, expira)
  values (left(p_chave, 200), v_janela, greatest(p_quanto, 0), to_timestamp((v_janela + 1) * greatest(p_segundos, 1)))
  on conflict (chave, janela) do update set n = l.n + greatest(p_quanto, 0)
  returning n into v_n;
  return v_n <= p_max;
end;
$$;
revoke all on function privado.contar_limite(text, integer, integer, integer) from public, anon, authenticated;

/**
 * Grava um lote de registros da oficina (até 500). Cada item: {colecao, id, dados, apagado}.
 * Quem não é da oficina não grava nada. O mecânico não muda o cadastro, as preferências, o
 * financeiro, os profissionais e os planos do clube, e nos outros registros com dinheiro o valor
 * gravado fica. Devolve a versão de cada um (o último a gravar vence). Teto: 256 KB por item,
 * 300 mil registros e 500 MB por oficina, 50 mil itens por hora.
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
  v_dados jsonb;
  v_antes jsonb;
  v_campo text;
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
  if not privado.contar_limite('registros:' || p_oficina::text, jsonb_array_length(p_itens), 50000, 3600) then
    raise exception 'Muitas gravações seguidas. Tente de novo daqui a pouco' using errcode = 'P0001';
  end if;
  if coalesce((select u.bytes from privado.uso_dados u where u.oficina_id = p_oficina), 0) > 524288000 then
    raise exception 'Limite de dados da oficina' using errcode = 'P0001';
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
    v_dados := v_item -> 'dados';
    if v_papel = 'mecanico' then
      if v_colecao in ('config', 'profissionais', 'clubePlanos') or privado.colecao_restrita(v_colecao) then
        continue;
      end if;
      if privado.colecao_com_dinheiro(v_colecao) then
        -- o valor que o mecânico mandou não vale: fica o que estava gravado
        select r.dados into v_antes from public.registros r where r.oficina_id = p_oficina and r.colecao = v_colecao and r.id = v_id;
        v_dados := v_dados - privado.campos_de_dinheiro(v_colecao);
        if v_antes is not null then
          foreach v_campo in array privado.campos_de_dinheiro(v_colecao) loop
            if v_antes ? v_campo then
              v_dados := v_dados || jsonb_build_object(v_campo, v_antes -> v_campo);
            end if;
          end loop;
        end if;
      end if;
    end if;
    insert into public.registros as r (oficina_id, colecao, id, dados, apagado)
    values (p_oficina, v_colecao, v_id, v_dados, coalesce((v_item ->> 'apagado')::boolean, false))
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
 * O mecânico não recebe o financeiro e recebe os outros registros sem os campos de dinheiro.
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
  select coalesce(jsonb_agg(jsonb_build_object('colecao', x.colecao, 'id', x.id,
           'dados', case when x.apagado then null else privado.dados_para_papel(x.colecao, x.dados, v_papel) end,
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

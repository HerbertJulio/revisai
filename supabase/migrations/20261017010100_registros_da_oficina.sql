-- Os dados de cada oficina (clientes, carros, serviços, orçamentos, ordens, estoque...) no banco,
-- um registro por item, separados por oficina. O app guarda uma cópia no aparelho e sincroniza:
-- manda o que mudou e busca o que os outros aparelhos mudaram desde a última vez.
-- A ordem das mudanças vem do número da transação (tx), que não depende do relógio de ninguém.

create table public.registros (
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  colecao text not null check (colecao ~ '^[a-z][A-Za-z0-9]{1,39}$'),
  id text not null check (char_length(id) between 1 and 100),
  dados jsonb not null check (jsonb_typeof(dados) = 'object'),
  apagado boolean not null default false,
  versao bigint not null default 1,
  tx bigint not null default (pg_current_xact_id()::text::bigint),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (oficina_id, colecao, id)
);

comment on table public.registros is 'Dados da oficina, um item por linha (coleção + id). Só os membros da oficina leem e gravam.';

create index registros_tx_idx on public.registros (oficina_id, tx, colecao, id);
create index registros_placa_idx on public.registros (oficina_id, ((dados ->> 'placa'))) where colecao = 'veiculos' and not apagado;

alter table public.registros enable row level security;
revoke all on public.registros from anon, authenticated;
grant select on public.registros to authenticated;

create policy "Membros leem os dados da oficina" on public.registros for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()));

-- Sinal para o tempo real: cada oficina tem uma linha que muda quando os dados mudam.
-- O app escuta essa linha (pequena) e busca o que mudou, em vez de receber cada registro.
create table public.oficinas_sinal (
  oficina_id uuid primary key references public.oficinas (id) on delete cascade,
  versao bigint not null default 0,
  atualizado_em timestamptz not null default now()
);

alter table public.oficinas_sinal enable row level security;
revoke all on public.oficinas_sinal from anon, authenticated;
grant select on public.oficinas_sinal to authenticated;
create policy "Membros escutam a oficina" on public.oficinas_sinal for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()));

create or replace function privado.registros_versao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.versao := old.versao + 1;
  new.tx := pg_current_xact_id()::text::bigint;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

create trigger registros_versao before update on public.registros
  for each row execute function privado.registros_versao();

create or replace function privado.registros_sinal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.oficinas_sinal (oficina_id, versao, atualizado_em)
  select distinct n.oficina_id, 1, now() from novos n
  on conflict (oficina_id) do update set versao = public.oficinas_sinal.versao + 1, atualizado_em = now();
  return null;
end;
$$;

create trigger registros_sinal_ins after insert on public.registros
  referencing new table as novos for each statement execute function privado.registros_sinal();
create trigger registros_sinal_upd after update on public.registros
  referencing new table as novos for each statement execute function privado.registros_sinal();

-- O cadastro da oficina (config/oficina) também vai para a tabela oficinas, que as lojas
-- (nos pedidos) e a equipe usam.
create or replace function privado.registros_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := new.dados;
  v_whats text := regexp_replace(coalesce(d ->> 'whatsapp', ''), '\D', '', 'g');
  v_uf text := upper(coalesce(d ->> 'uf', ''));
  v_link text := coalesce(d ->> 'linkAvaliacao', '');
begin
  if new.colecao <> 'config' or new.id <> 'oficina' or new.apagado then
    return new;
  end if;
  if v_whats <> '' and v_whats !~ '^55' then
    v_whats := '55' || v_whats;
  end if;
  update public.oficinas o set
    nome = coalesce(nullif(left(trim(d ->> 'nome'), 120), ''), o.nome),
    whatsapp = case when v_whats ~ '^55[0-9]{10,11}$' then v_whats else o.whatsapp end,
    cidade = nullif(left(trim(coalesce(d ->> 'cidade', '')), 80), ''),
    uf = case when v_uf ~ '^[A-Z]{2}$' then v_uf else null end,
    endereco = nullif(left(trim(coalesce(d ->> 'endereco', '')), 160), ''),
    link_avaliacao = case when v_link ~ '^https://' and char_length(v_link) <= 300 then v_link else null end
  where o.id = new.oficina_id;
  return new;
end;
$$;

create trigger registros_cadastro after insert or update on public.registros
  for each row when (new.colecao = 'config') execute function privado.registros_cadastro();

-- Coleções que o app sincroniza. Uma coleção nova precisa entrar aqui.
create or replace function privado.colecao_valida(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p = any (array[
    'config', 'clientes', 'veiculos', 'atendimentos', 'leituras', 'contatos', 'produtosProprios',
    'ordens', 'estoque', 'movimentos', 'documentos', 'pedidos',
    'lancamentos', 'agendamentos', 'checklists', 'garantias', 'comissoes', 'clube', 'lembretes'
  ]);
$$;

/**
 * Grava um lote de registros da oficina (até 500). Cada item: {colecao, id, dados, apagado}.
 * Quem não é da oficina não grava nada. O mecânico não muda o cadastro e as preferências.
 * Devolve a versão de cada um (o último a gravar vence).
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
    if v_colecao = 'config' and v_papel = 'mecanico' then
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
begin
  if privado.papel_na_oficina(p_oficina) is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('colecao', x.colecao, 'id', x.id, 'dados', case when x.apagado then null else x.dados end,
           'apagado', x.apagado, 'versao', x.versao, 'tx', x.tx) order by x.tx, x.colecao, x.id), '[]'::jsonb), count(*)
    into v_itens, v_n
    from (
      select r.colecao, r.id, r.dados, r.apagado, r.versao, r.tx
        from public.registros r
       where r.oficina_id = p_oficina
         and (r.tx, r.colecao, r.id) > (coalesce(p_desde, 0), coalesce(p_colecao, ''), coalesce(p_id, ''))
       order by r.tx, r.colecao, r.id
       limit v_lim
    ) x;
  return jsonb_build_object('itens', v_itens, 'mais', v_n >= v_lim, 'marca', v_marca);
end;
$$;

revoke all on function public.gravar_registros(uuid, jsonb), public.ler_registros(uuid, bigint, text, text, integer) from public, anon;
grant execute on function public.gravar_registros(uuid, jsonb), public.ler_registros(uuid, bigint, text, text, integer) to authenticated;

-- tempo real: o app escuta o sinal da oficina
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.oficinas_sinal;
  end if;
end $$;

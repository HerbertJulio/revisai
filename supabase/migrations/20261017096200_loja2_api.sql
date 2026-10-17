-- API de estoque e preço para o sistema da loja (ERP, Bling, Tiny ou planilha automática). O dono
-- da loja cria tokens no painel; o banco guarda só o SHA-256 de cada um e o começo (prefixo) para a
-- loja reconhecer qual é qual. As rotas /api/lojas/v1 chamam as funções daqui pelo cliente do
-- sistema (só a chave do sistema chega nelas): a função resolve o token, age só nos produtos daquela
-- loja (procura pelo código da loja, nunca cria produto) e registra a chamada só com contagens.

-- ------------------------------------------------------------------ prazo de entrega por produto

alter table public.produtos
  add column if not exists prazo_entrega_horas integer;
alter table public.produtos drop constraint if exists produtos_prazo_entrega_horas_check;
alter table public.produtos add constraint produtos_prazo_entrega_horas_check check (prazo_entrega_horas between 1 and 720);

comment on column public.produtos.prazo_entrega_horas is 'Prazo de entrega deste produto, em horas (vazio = o prazo da loja).';

-- ------------------------------------------------------------------ tokens

create table if not exists public.lojas_api_tokens (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id bigint not null references public.fornecedores (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 60),
  prefixo text not null check (prefixo ~ '^rvl_[a-z0-9]{8}$'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  ultimo_uso_em timestamptz,
  revogado boolean not null default false,
  revogado_em timestamptz,
  constraint lojas_api_tokens_hash_unico unique (token_hash)
);

comment on table public.lojas_api_tokens is 'Tokens da API da loja. Só o hash SHA-256 fica guardado; o token aparece uma vez, quando o dono cria.';

create index if not exists lojas_api_tokens_loja_idx on public.lojas_api_tokens (fornecedor_id, criado_em desc);

alter table public.lojas_api_tokens enable row level security;
revoke all on public.lojas_api_tokens from anon, authenticated;
-- o hash não sai pela API, nem para o dono
grant select (id, fornecedor_id, nome, prefixo, criado_em, ultimo_uso_em, revogado, revogado_em) on public.lojas_api_tokens to authenticated;

drop policy if exists "Dono da loja e equipe veem os tokens" on public.lojas_api_tokens;
create policy "Dono da loja e equipe veem os tokens" on public.lojas_api_tokens for select to authenticated
  using (coalesce(privado.papel_no_fornecedor(fornecedor_id), '') = 'dono' or (select privado.eh_equipe(array['suporte'])));

-- ------------------------------------------------------------------ registro das chamadas

create table if not exists privado.lojas_api_chamadas (
  id bigint generated always as identity primary key,
  token_id uuid references public.lojas_api_tokens (id) on delete set null,
  fornecedor_id bigint not null references public.fornecedores (id) on delete cascade,
  quando timestamptz not null default now(),
  metodo text not null check (metodo in ('GET', 'PATCH')),
  situacao integer not null check (situacao between 100 and 599),
  -- quantas vezes a mesma resposta repetiu no minuto (só para 429, o limite de chamadas)
  vezes integer not null default 1,
  recebidos integer not null default 0,
  devolvidos integer not null default 0,
  atualizados integer not null default 0,
  nao_encontrados integer not null default 0,
  erros integer not null default 0
);

create index if not exists lojas_api_chamadas_loja_idx on privado.lojas_api_chamadas (fornecedor_id, quando desc);
create index if not exists lojas_api_chamadas_token_idx on privado.lojas_api_chamadas (token_id, quando desc);

alter table privado.lojas_api_chamadas enable row level security;
drop policy if exists "Ninguém pela API" on privado.lojas_api_chamadas;
create policy "Ninguém pela API" on privado.lojas_api_chamadas as restrictive for all to public using (false) with check (false);
revoke all on privado.lojas_api_chamadas from public, anon, authenticated;

-- ------------------------------------------------------------------ o dono cria e revoga

/**
 * O dono cria um token: o servidor sorteia o token, manda só o prefixo e o hash, e mostra o token
 * uma vez. Até 10 tokens ativos por loja (RV067) e 20 por hora.
 */
create or replace function public.loja_api_criar_token(p_fornecedor bigint, p_nome text, p_prefixo text, p_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_fornecedor is null or coalesce(privado.papel_no_fornecedor(p_fornecedor), '') <> 'dono' then
    raise exception 'Só o dono da loja cria tokens da API' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_nome, ''))) not between 2 and 60 then
    raise exception 'Dê um nome ao token (de 2 a 60 letras)' using errcode = '22023';
  end if;
  if coalesce(p_prefixo, '') !~ '^rvl_[a-z0-9]{8}$' or coalesce(p_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Token inválido' using errcode = '22023';
  end if;
  if (select count(*) from public.lojas_api_tokens t where t.fornecedor_id = p_fornecedor and not t.revogado) >= 10 then
    raise exception 'A loja já tem 10 tokens ativos. Revogue um antes de criar outro' using errcode = 'RV067';
  end if;
  if (select count(*) from public.lojas_api_tokens t where t.fornecedor_id = p_fornecedor and t.criado_em > now() - interval '1 hour') >= 20 then
    raise exception 'Muitos tokens criados seguidos. Espere um pouco' using errcode = 'P0001';
  end if;
  insert into public.lojas_api_tokens (fornecedor_id, nome, prefixo, token_hash, criado_por)
  values (p_fornecedor, trim(p_nome), p_prefixo, p_hash, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

/** O dono (ou a equipe de suporte) revoga um token: ele para de funcionar na hora. */
create or replace function public.loja_api_revogar_token(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loja bigint;
begin
  select t.fornecedor_id into v_loja from public.lojas_api_tokens t where t.id = p_id;
  if v_loja is null or (coalesce(privado.papel_no_fornecedor(v_loja), '') <> 'dono' and not coalesce(privado.eh_equipe(array['suporte']), false)) then
    raise exception 'Token não encontrado' using errcode = '42501';
  end if;
  update public.lojas_api_tokens set revogado = true, revogado_em = now() where id = p_id and not revogado;
  return true;
end;
$$;

/** As últimas chamadas da API da loja (só contagens), para o dono acompanhar. */
create or replace function public.loja_api_chamadas(p_fornecedor bigint, p_limite integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_fornecedor is null or (coalesce(privado.papel_no_fornecedor(p_fornecedor), '') <> 'dono' and not coalesce(privado.eh_equipe(array['suporte']), false)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'hoje', coalesce((select sum(c.vezes) from privado.lojas_api_chamadas c
                       where c.fornecedor_id = p_fornecedor and c.quando >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'), 0),
    'chamadas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'quando', c.quando, 'metodo', c.metodo, 'situacao', c.situacao, 'vezes', c.vezes, 'recebidos', c.recebidos, 'devolvidos', c.devolvidos,
               'atualizados', c.atualizados, 'naoEncontrados', c.nao_encontrados, 'erros', c.erros, 'token', t.prefixo, 'nome', t.nome
             ) order by c.id desc)
        from (select * from privado.lojas_api_chamadas x where x.fornecedor_id = p_fornecedor order by x.id desc
               limit least(greatest(coalesce(p_limite, 30), 1), 200)) c
        left join public.lojas_api_tokens t on t.id = c.token_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.loja_api_criar_token(bigint, text, text, text), public.loja_api_revogar_token(uuid), public.loja_api_chamadas(bigint, integer) from public, anon;
grant execute on function public.loja_api_criar_token(bigint, text, text, text), public.loja_api_revogar_token(uuid), public.loja_api_chamadas(bigint, integer) to authenticated;

-- ------------------------------------------------------------------ o sistema da loja chama

/**
 * O token do sistema da loja: formato rvl_<8 letras e números>_<43 do base64url>, procurado pelo hash
 * entre os não revogados (RV066 quando não vale). Anota o uso (no máximo uma vez por minuto).
 */
create or replace function privado.loja2_token_da_api(p_token text)
returns public.lojas_api_tokens
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.lojas_api_tokens%rowtype;
begin
  if coalesce(p_token, '') !~ '^rvl_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$' then
    raise exception 'Token inválido ou revogado' using errcode = 'RV066';
  end if;
  select * into t from public.lojas_api_tokens x
   where x.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and not x.revogado;
  if t.id is null or t.prefixo <> left(p_token, 12) then
    raise exception 'Token inválido ou revogado' using errcode = 'RV066';
  end if;
  update public.lojas_api_tokens set ultimo_uso_em = now()
   where id = t.id and (ultimo_uso_em is null or ultimo_uso_em < now() - interval '1 minute');
  return t;
end;
$$;

revoke all on function privado.loja2_token_da_api(text) from public, anon, authenticated;

/** Registra uma chamada (só contagens). As 429 do mesmo token no mesmo minuto viram uma linha só. */
create or replace function privado.loja2_registrar_chamada(p_token public.lojas_api_tokens, p_metodo text, p_situacao integer,
  p_recebidos integer default 0, p_devolvidos integer default 0, p_atualizados integer default 0, p_nao_encontrados integer default 0, p_erros integer default 0)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_situacao = 429 then
    update privado.lojas_api_chamadas set vezes = vezes + 1
     where id = (select c.id from privado.lojas_api_chamadas c
                  where c.token_id = p_token.id and c.situacao = 429 and c.metodo = p_metodo and c.quando > now() - interval '1 minute'
                  order by c.id desc limit 1);
    if found then
      return;
    end if;
  end if;
  insert into privado.lojas_api_chamadas (token_id, fornecedor_id, metodo, situacao, recebidos, devolvidos, atualizados, nao_encontrados, erros)
  values (p_token.id, p_token.fornecedor_id, p_metodo, p_situacao, greatest(coalesce(p_recebidos, 0), 0), greatest(coalesce(p_devolvidos, 0), 0),
          greatest(coalesce(p_atualizados, 0), 0), greatest(coalesce(p_nao_encontrados, 0), 0), greatest(coalesce(p_erros, 0), 0));
end;
$$;

revoke all on function privado.loja2_registrar_chamada(public.lojas_api_tokens, text, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;

/** GET /produtos: os produtos da loja do token, em páginas por id (p_depois), ou só um código. */
create or replace function public.loja_api_listar(p_token text, p_codigo text default null, p_depois bigint default null, p_limite integer default 100)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.lojas_api_tokens%rowtype;
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
  v_itens jsonb;
  v_n integer;
  v_ultimo bigint;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  t := privado.loja2_token_da_api(p_token);
  select coalesce(jsonb_agg(x.item order by x.id), '[]'::jsonb), count(*), max(x.id)
    into v_itens, v_n, v_ultimo
    from (
      select p.id,
             jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nome', p.nome, 'marca', p.marca, 'categoria', p.categoria, 'unidade', p.unidade,
                                'preco', p.preco, 'estoque', p.estoque, 'prazo_entrega_horas', p.prazo_entrega_horas, 'ativo', p.ativo,
                                'oculto_moderacao', p.oculto_moderacao) as item
        from public.produtos p
       where p.fornecedor_id = t.fornecedor_id
         and (p_codigo is null or p.codigo = p_codigo)
         and (p_depois is null or p.id > p_depois)
       order by p.id
       limit v_limite
    ) x;
  perform privado.loja2_registrar_chamada(t, 'GET', 200, 0, v_n);
  return jsonb_build_object(
    'loja', (select jsonb_build_object('id', f.id, 'nome', f.nome, 'prazo_entrega_horas', f.prazo_entrega_horas) from public.fornecedores f where f.id = t.fornecedor_id),
    'produtos', v_itens,
    'proximo', case when v_n = v_limite then v_ultimo end
  );
end;
$$;

/**
 * PATCH /produtos: até 500 produtos, cada um pelo código da loja, com preço, estoque, prazo de
 * entrega e se está à venda. Muda só o que veio; nunca cria produto. Código que não é da loja vai em
 * nao_encontrados; valor fora da regra vai em erros (e o produto fica como estava).
 */
create or replace function public.loja_api_atualizar(p_token text, p_itens jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.lojas_api_tokens%rowtype;
  i jsonb;
  v_codigo text;
  p public.produtos%rowtype;
  v_preco numeric;
  v_estoque integer;
  v_prazo integer;
  v_ativo boolean;
  v_num numeric;
  v_erro text;
  v_recebidos integer := 0;
  v_atualizados integer := 0;
  v_iguais integer := 0;
  v_nao jsonb := '[]'::jsonb;
  v_erros jsonb := '[]'::jsonb;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  t := privado.loja2_token_da_api(p_token);
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'Mande de 1 a 500 produtos por vez' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) not between 1 and 500 then
    raise exception 'Mande de 1 a 500 produtos por vez' using errcode = '22023';
  end if;
  for i in select value from jsonb_array_elements(p_itens)
  loop
    v_recebidos := v_recebidos + 1;
    v_codigo := case when jsonb_typeof(i -> 'codigo') = 'string' then i ->> 'codigo' end;
    v_erro := null;
    v_preco := null;
    v_estoque := null;
    v_prazo := null;
    v_ativo := null;
    -- cada valor é conferido antes de virar número (o tipo primeiro, depois a faixa)
    if jsonb_typeof(i) is distinct from 'object' or v_codigo is null or char_length(v_codigo) not between 1 and 60 then
      v_erro := 'Falta o código do produto';
    elsif not (i ? 'preco' or i ? 'estoque' or i ? 'prazo_entrega_horas' or i ? 'ativo') then
      v_erro := 'Mande pelo menos um de preco, estoque, prazo_entrega_horas ou ativo';
    end if;
    if v_erro is null and i ? 'preco' then
      if jsonb_typeof(i -> 'preco') <> 'number' then
        v_erro := 'O preço vai de 0,01 a 100.000';
      else
        v_num := (i ->> 'preco')::numeric;
        if v_num < 0.01 or v_num > 100000 then
          v_erro := 'O preço vai de 0,01 a 100.000';
        else
          v_preco := round(v_num, 2);
        end if;
      end if;
    end if;
    if v_erro is null and i ? 'estoque' and jsonb_typeof(i -> 'estoque') <> 'null' then
      if jsonb_typeof(i -> 'estoque') <> 'number' then
        v_erro := 'O estoque é um número inteiro de 0 a 1.000.000 (ou null para não controlar)';
      else
        v_num := (i ->> 'estoque')::numeric;
        if v_num <> trunc(v_num) or v_num < 0 or v_num > 1000000 then
          v_erro := 'O estoque é um número inteiro de 0 a 1.000.000 (ou null para não controlar)';
        else
          v_estoque := v_num::integer;
        end if;
      end if;
    end if;
    if v_erro is null and i ? 'prazo_entrega_horas' and jsonb_typeof(i -> 'prazo_entrega_horas') <> 'null' then
      if jsonb_typeof(i -> 'prazo_entrega_horas') <> 'number' then
        v_erro := 'O prazo de entrega vai de 1 a 720 horas (ou null para usar o da loja)';
      else
        v_num := (i ->> 'prazo_entrega_horas')::numeric;
        if v_num <> trunc(v_num) or v_num < 1 or v_num > 720 then
          v_erro := 'O prazo de entrega vai de 1 a 720 horas (ou null para usar o da loja)';
        else
          v_prazo := v_num::integer;
        end if;
      end if;
    end if;
    if v_erro is null and i ? 'ativo' then
      if jsonb_typeof(i -> 'ativo') <> 'boolean' then
        v_erro := 'ativo é true ou false';
      else
        v_ativo := (i ->> 'ativo')::boolean;
      end if;
    end if;
    if v_erro is not null then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('codigo', v_codigo, 'erro', v_erro));
      continue;
    end if;

    select * into p from public.produtos x where x.fornecedor_id = t.fornecedor_id and x.codigo = v_codigo for update;
    if p.id is null then
      v_nao := v_nao || to_jsonb(v_codigo);
      continue;
    end if;
    -- o que não veio fica como está; null no estoque e no prazo vale (não controla / prazo da loja)
    v_preco := case when i ? 'preco' then v_preco else p.preco end;
    v_estoque := case when i ? 'estoque' then v_estoque else p.estoque end;
    v_prazo := case when i ? 'prazo_entrega_horas' then v_prazo else p.prazo_entrega_horas end;
    v_ativo := case when i ? 'ativo' then v_ativo else p.ativo end;
    if v_preco = p.preco and v_estoque is not distinct from p.estoque and v_prazo is not distinct from p.prazo_entrega_horas and v_ativo = p.ativo then
      v_iguais := v_iguais + 1;
      continue;
    end if;
    update public.produtos set preco = v_preco, estoque = v_estoque, prazo_entrega_horas = v_prazo, ativo = v_ativo where id = p.id;
    v_atualizados := v_atualizados + 1;
  end loop;
  perform privado.loja2_registrar_chamada(t, 'PATCH', 200, v_recebidos, 0, v_atualizados, jsonb_array_length(v_nao), jsonb_array_length(v_erros));
  return jsonb_build_object('recebidos', v_recebidos, 'atualizados', v_atualizados, 'sem_mudanca', v_iguais, 'nao_encontrados', v_nao, 'erros', v_erros);
end;
$$;

/**
 * Registra uma chamada que o servidor recusou antes de mexer nos produtos (corpo inválido, limite
 * de chamadas). Com token que não vale, não registra nada (não há loja para atribuir).
 */
create or replace function public.loja_api_registrar(p_token text, p_metodo text, p_situacao integer, p_recebidos integer default 0)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.lojas_api_tokens%rowtype;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if coalesce(p_metodo, '') not in ('GET', 'PATCH') or p_situacao is null or p_situacao not between 100 and 599 then
    return false;
  end if;
  begin
    t := privado.loja2_token_da_api(p_token);
  exception when sqlstate 'RV066' then
    return false;
  end;
  perform privado.loja2_registrar_chamada(t, p_metodo, p_situacao, p_recebidos, 0, 0, 0, case when p_situacao >= 400 then 1 else 0 end);
  return true;
end;
$$;

revoke all on function public.loja_api_listar(text, text, bigint, integer), public.loja_api_atualizar(text, jsonb), public.loja_api_registrar(text, text, integer, integer) from public, authenticated;
grant execute on function public.loja_api_listar(text, text, bigint, integer), public.loja_api_atualizar(text, jsonb), public.loja_api_registrar(text, text, integer, integer) to anon;

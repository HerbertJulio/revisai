-- Venda faturada: cada loja dá crédito (limite em aberto e prazo) às oficinas em quem confia e que já
-- compraram dela. No pedido, a oficina escolhe por loja como paga: Pix (o padrão) ou faturado, em
-- public.pedidos.pagamentos = {"<fornecedor_id>": "pix" | "faturado"}. O banco confere a linha de
-- crédito e o saldo em aberto na hora de criar a parte da loja, guarda o prazo na parte e marca o
-- vencimento quando ela é entregue (entrega + prazo). O risco do crédito é da loja: o Revisaí não
-- garante o pagamento. Nada aqui redefine public.calcular_pedido: são gatilhos à parte.

-- ------------------------------------------------------------------ dinheiro no jeito brasileiro

/** 1500.5 vira '1.500,50' (para as mensagens dos erros). */
create or replace function privado.loja2_reais(p_valor numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(to_char(round(coalesce(p_valor, 0), 2), 'FM999G999G999G990D00'), ',.', '.,');
$$;

revoke all on function privado.loja2_reais(numeric) from public, anon, authenticated;
grant execute on function privado.loja2_reais(numeric) to anon, authenticated;

-- ------------------------------------------------------------------ linhas de crédito

create table if not exists public.lojas_credito (
  id bigint generated always as identity primary key,
  fornecedor_id bigint not null references public.fornecedores (id) on delete cascade,
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  limite numeric(12, 2) not null check (limite > 0 and limite <= 1000000),
  prazo_dias integer not null check (prazo_dias between 1 and 120),
  ativo boolean not null default true,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint lojas_credito_par unique (fornecedor_id, oficina_id)
);

comment on table public.lojas_credito is 'Crédito que a loja dá a uma oficina que já comprou dela: quanto pode ficar em aberto e em quantos dias depois da entrega a oficina paga. O risco é da loja.';

create index if not exists lojas_credito_oficina_idx on public.lojas_credito (oficina_id);

alter table public.lojas_credito enable row level security;
revoke all on public.lojas_credito from anon, authenticated;
grant select, insert, update on public.lojas_credito to authenticated;

drop policy if exists "Loja, oficina e equipe veem o crédito" on public.lojas_credito;
drop policy if exists "Dono da loja dá crédito a quem já comprou" on public.lojas_credito;
drop policy if exists "Dono da loja muda o crédito" on public.lojas_credito;
create policy "Loja, oficina e equipe veem o crédito" on public.lojas_credito for select to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()) or oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe()));
-- crédito é decisão de dinheiro: só o dono, e só para quem já comprou da loja
create policy "Dono da loja dá crédito a quem já comprou" on public.lojas_credito for insert to authenticated
  with check (
    coalesce(privado.papel_no_fornecedor(fornecedor_id), '') = 'dono'
    and exists (select 1 from public.pedidos_fornecedores pf where pf.fornecedor_id = lojas_credito.fornecedor_id and pf.oficina_id = lojas_credito.oficina_id)
  );
create policy "Dono da loja muda o crédito" on public.lojas_credito for update to authenticated
  using (coalesce(privado.papel_no_fornecedor(fornecedor_id), '') = 'dono')
  with check (coalesce(privado.papel_no_fornecedor(fornecedor_id), '') = 'dono');

-- o crédito não muda de loja nem de oficina; quem criou e quando ficam como estão
create or replace function privado.loja2_regras_do_credito()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.criado_em := now();
  elsif new.fornecedor_id is distinct from old.fornecedor_id or new.oficina_id is distinct from old.oficina_id
        or new.criado_por is distinct from old.criado_por or new.criado_em is distinct from old.criado_em then
    raise exception 'O crédito não muda de loja nem de oficina' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists lojas_credito_regras on public.lojas_credito;
create trigger lojas_credito_regras before insert or update on public.lojas_credito
  for each row execute function privado.loja2_regras_do_credito();

-- ------------------------------------------------------------------ forma de pagamento no pedido

alter table public.pedidos
  add column if not exists pagamentos jsonb;
alter table public.pedidos drop constraint if exists pedidos_pagamentos_formato;
alter table public.pedidos add constraint pedidos_pagamentos_formato
  check (pagamentos is null or (jsonb_typeof(pagamentos) = 'object' and octet_length(pagamentos::text) <= 4000));

comment on column public.pedidos.pagamentos is 'Como a oficina paga cada loja do pedido: {"<fornecedor_id>": "pix" | "faturado"}. Loja fora da lista paga por Pix.';

alter table public.pedidos_fornecedores
  add column if not exists forma_pagamento text not null default 'pix',
  add column if not exists prazo_dias integer,
  add column if not exists vencimento date;
alter table public.pedidos_fornecedores drop constraint if exists pedidos_fornecedores_forma_pagamento_check;
alter table public.pedidos_fornecedores add constraint pedidos_fornecedores_forma_pagamento_check check (forma_pagamento in ('pix', 'faturado'));
alter table public.pedidos_fornecedores drop constraint if exists pedidos_fornecedores_prazo_do_faturado;
alter table public.pedidos_fornecedores add constraint pedidos_fornecedores_prazo_do_faturado
  check ((forma_pagamento = 'pix' and prazo_dias is null) or (forma_pagamento = 'faturado' and prazo_dias between 1 and 120));

comment on column public.pedidos_fornecedores.forma_pagamento is 'pix (paga na confirmação) ou faturado (paga até o vencimento, com o crédito que a loja deu).';
comment on column public.pedidos_fornecedores.prazo_dias is 'Prazo do faturado, em dias depois da entrega (o da linha de crédito na hora do pedido).';
comment on column public.pedidos_fornecedores.vencimento is 'Faturado: dia da entrega (em Brasília) mais o prazo. Vazio até a entrega.';

create index if not exists pedidos_fornecedores_faturado_idx on public.pedidos_fornecedores (fornecedor_id, oficina_id)
  where forma_pagamento = 'faturado';

/**
 * Confere public.pedidos.pagamentos antes de gravar o pedido (depois do cálculo dos itens): cada
 * chave é uma loja do pedido e cada valor, 'pix' ou 'faturado'. Recusa com RV063.
 */
create or replace function privado.loja2_conferir_pagamentos()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_chave text;
  v_valor jsonb;
  v_lojas bigint[];
begin
  if new.pagamentos is null or new.pagamentos = '{}'::jsonb then
    new.pagamentos := null;
    return new;
  end if;
  if jsonb_typeof(new.pagamentos) <> 'object' or (select count(*) from jsonb_object_keys(new.pagamentos)) > 50 then
    raise exception 'A forma de pagamento do pedido não confere' using errcode = 'RV063';
  end if;
  select coalesce(array_agg(distinct (i ->> 'fornecedor_id')::bigint), '{}'::bigint[]) into v_lojas
    from jsonb_array_elements(case when jsonb_typeof(new.itens) = 'array' then new.itens else '[]'::jsonb end) i
   where jsonb_typeof(i -> 'fornecedor_id') = 'number';
  for v_chave, v_valor in select key, value from jsonb_each(new.pagamentos)
  loop
    if v_chave !~ '^[1-9][0-9]{0,17}$'
       or coalesce(jsonb_typeof(v_valor), '') <> 'string'
       or coalesce(v_valor #>> '{}', '') not in ('pix', 'faturado')
       or not coalesce(v_chave::bigint = any (v_lojas), false) then
      raise exception 'A forma de pagamento do pedido não confere' using errcode = 'RV063', detail = left(v_chave, 20);
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function privado.loja2_conferir_pagamentos() from public, anon, authenticated;

-- depois de pedidos_calcular (os itens já vêm com a loja de cada produto)
drop trigger if exists pedidos_loja2_pagamentos on public.pedidos;
create trigger pedidos_loja2_pagamentos before insert on public.pedidos
  for each row execute function privado.loja2_conferir_pagamentos();

/**
 * A parte da loja nasce com a forma de pagamento que a oficina escolheu. Faturado só com linha de
 * crédito ativa (RV062), e o que está em aberto (faturado não pago e não cancelado) mais esta parte
 * cabe no limite (RV061, com o valor livre em detail e a loja em hint). A linha fica travada até o fim
 * da transação, para dois pedidos ao mesmo tempo não passarem do limite.
 */
create or replace function privado.loja2_faturado_da_parte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_forma text;
  c public.lojas_credito%rowtype;
  v_nome text;
  v_aberto numeric(12, 2);
  v_livre numeric(12, 2);
begin
  select p.pagamentos ->> new.fornecedor_id::text into v_forma from public.pedidos p where p.id = new.pedido_id;
  new.vencimento := null;
  if coalesce(v_forma, 'pix') <> 'faturado' then
    new.forma_pagamento := 'pix';
    new.prazo_dias := null;
    return new;
  end if;
  select f.nome into v_nome from public.fornecedores f where f.id = new.fornecedor_id;
  if new.oficina_id is not null then
    select * into c from public.lojas_credito l where l.fornecedor_id = new.fornecedor_id and l.oficina_id = new.oficina_id for update;
  end if;
  if new.oficina_id is null or c.id is null or not coalesce(c.ativo, false) then
    raise exception 'A % não vende faturado para esta oficina. Escolha Pix para essa loja', coalesce(v_nome, 'loja')
      using errcode = 'RV062', hint = new.fornecedor_id::text;
  end if;
  select coalesce(sum(pf.subtotal), 0) into v_aberto
    from public.pedidos_fornecedores pf
   where pf.fornecedor_id = new.fornecedor_id and pf.oficina_id = new.oficina_id
     and pf.forma_pagamento = 'faturado' and pf.status <> 'cancelado' and pf.pagamento <> 'confirmado';
  if v_aberto + coalesce(new.subtotal, 0) > c.limite then
    v_livre := greatest(c.limite - v_aberto, 0);
    raise exception 'O limite faturado na % não cobre esta compra. Estão livres R$ %', coalesce(v_nome, 'loja'), privado.loja2_reais(v_livre)
      using errcode = 'RV061', detail = v_livre::text, hint = new.fornecedor_id::text;
  end if;
  new.forma_pagamento := 'faturado';
  new.prazo_dias := c.prazo_dias;
  return new;
end;
$$;

revoke all on function privado.loja2_faturado_da_parte() from public, anon, authenticated;

drop trigger if exists pedidos_fornecedores_faturado on public.pedidos_fornecedores;
create trigger pedidos_fornecedores_faturado before insert on public.pedidos_fornecedores
  for each row execute function privado.loja2_faturado_da_parte();

/**
 * Depois do pedido, forma, prazo e vencimento não mudam pelo app (só a equipe de suporte). O
 * vencimento do faturado sai quando a parte é entregue: o dia da entrega em Brasília mais o prazo.
 * Roda depois de pedidos_fornecedores_regras, que marca entregue_em. Sem security definer: a
 * pergunta "veio da API?" precisa do papel de quem chamou.
 */
create or replace function privado.loja2_vencimento_da_parte()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.forma_pagamento is distinct from old.forma_pagamento or new.prazo_dias is distinct from old.prazo_dias
      or new.vencimento is distinct from old.vencimento)
     and privado.veio_da_api() and not coalesce(privado.eh_equipe(array['suporte']), false) then
    raise exception 'A forma de pagamento e o vencimento não mudam depois do pedido' using errcode = '42501';
  end if;
  if new.forma_pagamento = 'faturado' and new.status = 'entregue' and new.vencimento is null then
    new.vencimento := (coalesce(new.entregue_em, now()) at time zone 'America/Sao_Paulo')::date + coalesce(new.prazo_dias, 0);
  end if;
  return new;
end;
$$;

revoke all on function privado.loja2_vencimento_da_parte() from public, anon, authenticated;

drop trigger if exists pedidos_fornecedores_vencimento on public.pedidos_fornecedores;
create trigger pedidos_fornecedores_vencimento before update on public.pedidos_fornecedores
  for each row execute function privado.loja2_vencimento_da_parte();

-- ------------------------------------------------------------------ leituras

/**
 * Os clientes da loja (quem já comprou) com a linha de crédito de cada um e o que está em aberto no
 * faturado (e quanto disso já venceu). Para a página de crédito do painel da loja.
 */
create or replace function public.loja_creditos(p_fornecedor bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_fornecedor is null or (privado.papel_no_fornecedor(p_fornecedor) is null and not coalesce(privado.eh_equipe(), false)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'oficinaId', c.oficina_id, 'nome', c.nome, 'cidade', c.cidade, 'uf', c.uf,
             'pedidos', c.pedidos, 'total', c.total, 'ultimo', c.ultimo,
             'credito', case when l.id is null then null
                             else jsonb_build_object('limite', l.limite, 'prazoDias', l.prazo_dias, 'ativo', l.ativo, 'atualizadoEm', l.atualizado_em) end,
             'aberto', coalesce(a.aberto, 0), 'vencido', coalesce(a.vencido, 0), 'faturas', coalesce(a.faturas, 0)
           ) order by (l.id is null), c.ultimo desc)
      from (
        select pf.oficina_id,
               (array_agg(pf.oficina_nome order by pf.criado_em desc))[1] as nome,
               (array_agg(pf.oficina_cidade order by pf.criado_em desc))[1] as cidade,
               (array_agg(pf.oficina_uf order by pf.criado_em desc))[1] as uf,
               count(*) filter (where pf.status <> 'cancelado')::integer as pedidos,
               coalesce(sum(pf.subtotal) filter (where pf.status <> 'cancelado'), 0) as total,
               max(pf.criado_em) as ultimo
          from public.pedidos_fornecedores pf
         where pf.fornecedor_id = p_fornecedor and pf.oficina_id is not null
         group by pf.oficina_id
         limit 2000
      ) c
      left join public.lojas_credito l on l.fornecedor_id = p_fornecedor and l.oficina_id = c.oficina_id
      left join lateral (
        select sum(pf.subtotal) as aberto,
               sum(pf.subtotal) filter (where pf.vencimento < v_hoje) as vencido,
               count(*)::integer as faturas
          from public.pedidos_fornecedores pf
         where pf.fornecedor_id = p_fornecedor and pf.oficina_id = c.oficina_id
           and pf.forma_pagamento = 'faturado' and pf.status <> 'cancelado' and pf.pagamento <> 'confirmado'
      ) a on true
  ), '[]'::jsonb);
end;
$$;

/**
 * As lojas que vendem faturado para a oficina (linhas ativas), com o que está em aberto e o que
 * ainda cabe: para a oficina escolher a forma de pagamento no pedido.
 */
create or replace function public.credito_da_oficina(p_oficina uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_oficina is null or (privado.papel_na_oficina(p_oficina) is null and not coalesce(privado.eh_equipe(), false)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'fornecedorId', l.fornecedor_id, 'loja', f.nome, 'limite', l.limite, 'prazoDias', l.prazo_dias,
             'aberto', coalesce(a.aberto, 0), 'livre', greatest(l.limite - coalesce(a.aberto, 0), 0)
           ) order by f.nome)
      from public.lojas_credito l
      join public.fornecedores f on f.id = l.fornecedor_id and f.ativo
      left join lateral (
        select sum(pf.subtotal) as aberto
          from public.pedidos_fornecedores pf
         where pf.fornecedor_id = l.fornecedor_id and pf.oficina_id = l.oficina_id
           and pf.forma_pagamento = 'faturado' and pf.status <> 'cancelado' and pf.pagamento <> 'confirmado'
      ) a on true
     where l.oficina_id = p_oficina and l.ativo
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.loja_creditos(bigint), public.credito_da_oficina(uuid) from public, anon;
grant execute on function public.loja_creditos(bigint), public.credito_da_oficina(uuid) to authenticated;

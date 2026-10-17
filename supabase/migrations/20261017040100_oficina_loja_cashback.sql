-- O cashback que a oficina tem numa loja vira pagamento numa compra nessa loja.
--
-- O pedido leva quanto usar em cada loja (pedidos.cashback, {"<fornecedor_id>": valor}). Depois que o
-- pedido é dividido em partes, privado.usar_cashback_do_pedido, para cada loja (sempre na ordem do id,
-- para dois pedidos ao mesmo tempo não se travarem um no outro): trava o saldo da oficina naquela loja
-- (cadeado da transação por oficina e loja), confere que o saldo cobre, grava o "uso" no livro ligado à
-- parte e baixa o valor a pagar da parte (pedidos_fornecedores.cashback; o Pix sai pelo subtotal menos
-- o cashback). Se algo não confere, o pedido inteiro não entra (RV031 saldo, RV032 passa do valor da
-- compra, RV033 pedido de cashback inválido; a loja vai no detail).
--
-- O que acontece depois:
-- - A parte cancelada devolve o cashback usado nela ("uso_desfeito"). Se a equipe tirar o cancelamento,
--   o uso volta.
-- - O crédito novo (pedido entregue e pago) é o percentual sobre o que a oficina pagou de fato
--   (subtotal menos o cashback usado).
-- - Um crédito já usado que é estornado depois (a loja desfaz a confirmação do pagamento) NÃO é
--   bloqueado: o estorno vale e o saldo pode ficar negativo. Bloquear prenderia a loja a um pagamento
--   que talvez não tenha chegado. Com o saldo negativo, a oficina não usa cashback naquela loja até os
--   próximos créditos cobrirem a diferença (o saldo é a soma do livro, então cobrem primeiro).
-- Crédito, estorno, uso e uso desfeito da mesma oficina na mesma loja passam pelo mesmo cadeado.

-- ------------------------------------------------------------------ colunas

alter table public.pedidos add column if not exists cashback jsonb;

comment on column public.pedidos.cashback is 'O cashback que a oficina pediu para usar em cada loja ({"<fornecedor_id>": valor}); o usado de fato fica em pedidos_fornecedores.cashback.';

alter table public.pedidos_fornecedores add column if not exists cashback numeric(10, 2) not null default 0 check (cashback >= 0);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_fornecedores_cashback_ate_subtotal' and conrelid = 'public.pedidos_fornecedores'::regclass) then
    alter table public.pedidos_fornecedores add constraint pedidos_fornecedores_cashback_ate_subtotal check (cashback <= subtotal);
  end if;
end;
$$;

comment on column public.pedidos_fornecedores.cashback is 'Cashback da oficina usado nesta compra: sai do valor a pagar (Pix = subtotal - cashback). Só a função do pedido grava.';

-- o livro ganha o "uso desfeito" (a compra que usou o cashback foi cancelada)
alter table public.cashback_movimentos drop constraint if exists cashback_movimentos_tipo_check;
alter table public.cashback_movimentos add constraint cashback_movimentos_tipo_check check (tipo in ('credito', 'uso', 'estorno', 'uso_desfeito'));

comment on table public.cashback_movimentos is 'Livro do cashback: crédito (pedido entregue e pago), uso (numa compra), estorno (pagamento desfeito) e uso desfeito (compra cancelada).';

-- ------------------------------------------------------------------ saldo e cadeado

/** O cadeado do cashback da oficina numa loja, até o fim da transação. */
create or replace function privado.travar_cashback(p_oficina uuid, p_fornecedor bigint)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('cashback:' || p_oficina::text || ':' || p_fornecedor::text, 0));
$$;

/** O saldo do livro, sem conferir quem pergunta (só para as funções do banco). */
create or replace function privado.saldo_do_cashback(p_oficina uuid, p_fornecedor bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when tipo in ('credito', 'uso_desfeito') then valor else -valor end), 0)
    from public.cashback_movimentos
   where oficina_id = p_oficina and (p_fornecedor is null or fornecedor_id = p_fornecedor);
$$;

revoke all on function privado.travar_cashback(uuid, bigint), privado.saldo_do_cashback(uuid, bigint) from public, anon, authenticated;

/**
 * O saldo de cashback da oficina numa loja (crédito e uso desfeito, menos uso e estorno; pode ficar
 * negativo depois de um estorno). Sem a loja (p_fornecedor nulo), o saldo em todas as lojas. Para a
 * oficina, para a loja (só o saldo na própria loja) e para a equipe.
 */
create or replace function public.saldo_cashback(p_oficina uuid, p_fornecedor bigint)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    p_oficina in (select privado.minhas_oficinas())
    or (p_fornecedor is not null and p_fornecedor in (select privado.meus_fornecedores()))
    or privado.eh_equipe()
    or privado.sistema_autorizado()
  ) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return privado.saldo_do_cashback(p_oficina, p_fornecedor);
end;
$$;

revoke all on function public.saldo_cashback(uuid, bigint) from public;
grant execute on function public.saldo_cashback(uuid, bigint) to anon, authenticated;

/** Os saldos da oficina em cada loja (só as lojas com movimento). Pelas regras de leitura do livro. */
create or replace function public.saldos_de_cashback(p_oficina uuid)
returns table (fornecedor_id bigint, saldo numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.fornecedor_id, sum(case when m.tipo in ('credito', 'uso_desfeito') then m.valor else -m.valor end)
    from public.cashback_movimentos m
   where m.oficina_id = p_oficina
   group by m.fornecedor_id
   order by m.fornecedor_id;
$$;

revoke all on function public.saldos_de_cashback(uuid) from public, anon;
grant execute on function public.saldos_de_cashback(uuid) to authenticated;

-- ------------------------------------------------------------------ o uso, no pedido

/** Depois de dividir o pedido: usa o cashback pedido em cada loja (ou recusa o pedido inteiro). */
create or replace function privado.usar_cashback_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text;
  v_valor jsonb;
  v_quanto numeric(12, 2);
  v_parte public.pedidos_fornecedores%rowtype;
  v_nome text;
  v_saldo numeric(12, 2);
begin
  if new.cashback is null or new.cashback = '{}'::jsonb or new.cashback = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(new.cashback) <> 'object' or new.oficina_id is null then
    raise exception 'O cashback do pedido não confere' using errcode = 'RV033';
  end if;
  if (select count(*) from jsonb_object_keys(new.cashback)) > 50 then
    raise exception 'O cashback do pedido não confere' using errcode = 'RV033';
  end if;
  -- confere tudo antes de travar qualquer saldo
  for v_chave, v_valor in select key, value from jsonb_each(new.cashback)
  loop
    if v_chave !~ '^[1-9][0-9]{0,17}$' or jsonb_typeof(v_valor) <> 'number'
       or (v_valor #>> '{}')::numeric <= 0 or (v_valor #>> '{}')::numeric > 1000000
       or (v_valor #>> '{}')::numeric <> round((v_valor #>> '{}')::numeric, 2) then
      raise exception 'O cashback do pedido não confere' using errcode = 'RV033';
    end if;
  end loop;

  for v_chave, v_valor in select key, value from jsonb_each(new.cashback) order by key::bigint
  loop
    v_quanto := (v_valor #>> '{}')::numeric;
    select * into v_parte from public.pedidos_fornecedores where pedido_id = new.id and fornecedor_id = v_chave::bigint;
    if not found then
      raise exception 'O cashback do pedido não confere' using errcode = 'RV033', detail = v_chave;
    end if;
    select nome into v_nome from public.fornecedores where id = v_parte.fornecedor_id;
    if v_quanto > v_parte.subtotal then
      raise exception 'O cashback na % passa do valor da compra (R$ %)', coalesce(v_nome, 'loja'), replace(to_char(v_parte.subtotal, 'FM9999990D00'), '.', ',')
        using errcode = 'RV032', detail = v_chave;
    end if;
    perform privado.travar_cashback(new.oficina_id, v_parte.fornecedor_id);
    v_saldo := privado.saldo_do_cashback(new.oficina_id, v_parte.fornecedor_id);
    if v_saldo < v_quanto then
      raise exception 'O seu cashback na % é de R$ %', coalesce(v_nome, 'loja'), replace(to_char(greatest(v_saldo, 0), 'FM9999990D00'), '.', ',')
        using errcode = 'RV031', detail = v_chave;
    end if;
    insert into public.cashback_movimentos (oficina_id, fornecedor_id, parte_id, valor, tipo)
    values (new.oficina_id, v_parte.fornecedor_id, v_parte.id, v_quanto, 'uso');
    perform set_config('revisai.cashback_do_pedido', 'sim', true);
    update public.pedidos_fornecedores set cashback = v_quanto where id = v_parte.id;
    perform set_config('revisai.cashback_do_pedido', '', true);
  end loop;
  return null;
end;
$$;

revoke all on function privado.usar_cashback_do_pedido() from public, anon, authenticated;

-- depois de pedidos_dividir (os gatilhos AFTER rodam em ordem alfabética)
drop trigger if exists pedidos_usar_cashback on public.pedidos;
create trigger pedidos_usar_cashback after insert on public.pedidos
  for each row execute function privado.usar_cashback_do_pedido();

/** O cashback da parte só muda pela função do pedido (ou por SQL direto da equipe técnica). */
create or replace function privado.cashback_fixo_da_parte()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.cashback <> 0) or (tg_op = 'UPDATE' and new.cashback is distinct from old.cashback) then
    if coalesce(current_setting('revisai.cashback_do_pedido', true), '') <> 'sim'
       and coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
      raise exception 'O cashback da compra não muda' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function privado.cashback_fixo_da_parte() from public, anon, authenticated;

drop trigger if exists pedidos_fornecedores_cashback_fixo on public.pedidos_fornecedores;
create trigger pedidos_fornecedores_cashback_fixo before insert or update on public.pedidos_fornecedores
  for each row execute function privado.cashback_fixo_da_parte();

-- ------------------------------------------------------------------ crédito, estorno e uso desfeito

/**
 * Entregue e pago dá o crédito (sobre o que a oficina pagou: subtotal menos o cashback usado); sair
 * disso estorna o que foi dado, mesmo que o saldo fique negativo. Cancelar a compra devolve o cashback
 * usado nela; tirar o cancelamento (só a equipe) usa de novo.
 */
create or replace function privado.cashback_da_parte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes boolean := old.status = 'entregue' and old.pagamento = 'confirmado';
  v_agora boolean := new.status = 'entregue' and new.pagamento = 'confirmado';
  v_cancelou boolean := new.status = 'cancelado' and old.status is distinct from 'cancelado';
  v_voltou boolean := old.status = 'cancelado' and new.status is distinct from 'cancelado';
  v_liquido numeric(10, 2);
  v_usado numeric(10, 2);
  v_pct numeric(4, 2);
  v_valor numeric(10, 2);
begin
  if new.oficina_id is null or (v_antes = v_agora and not v_cancelou and not v_voltou) then
    return null;
  end if;
  perform privado.travar_cashback(new.oficina_id, new.fornecedor_id);

  if v_antes <> v_agora then
    select coalesce(sum(case tipo when 'credito' then valor when 'estorno' then -valor else 0 end), 0)
      into v_liquido
      from public.cashback_movimentos where parte_id = new.id;
    if v_agora then
      if v_liquido <= 0 then
        select cashback_percentual into v_pct from public.fornecedores where id = new.fornecedor_id;
        v_valor := round((new.subtotal - coalesce(new.cashback, 0)) * coalesce(v_pct, 0) / 100, 2);
        if v_valor > 0 then
          insert into public.cashback_movimentos (oficina_id, fornecedor_id, parte_id, valor, tipo, percentual)
          values (new.oficina_id, new.fornecedor_id, new.id, v_valor, 'credito', v_pct);
        end if;
      end if;
    elsif v_liquido > 0 then
      insert into public.cashback_movimentos (oficina_id, fornecedor_id, parte_id, valor, tipo)
      values (new.oficina_id, new.fornecedor_id, new.id, v_liquido, 'estorno');
    end if;
  end if;

  if v_cancelou or v_voltou then
    select coalesce(sum(case tipo when 'uso' then valor when 'uso_desfeito' then -valor else 0 end), 0)
      into v_usado
      from public.cashback_movimentos where parte_id = new.id;
    if v_cancelou and v_usado > 0 then
      insert into public.cashback_movimentos (oficina_id, fornecedor_id, parte_id, valor, tipo)
      values (new.oficina_id, new.fornecedor_id, new.id, v_usado, 'uso_desfeito');
    elsif v_voltou and v_usado <= 0 and coalesce(new.cashback, 0) > 0 then
      insert into public.cashback_movimentos (oficina_id, fornecedor_id, parte_id, valor, tipo)
      values (new.oficina_id, new.fornecedor_id, new.id, new.cashback, 'uso');
    end if;
  end if;
  return null;
end;
$$;

revoke all on function privado.cashback_da_parte() from public, anon, authenticated;

drop trigger if exists pedidos_fornecedores_cashback on public.pedidos_fornecedores;
create trigger pedidos_fornecedores_cashback after update of status, pagamento on public.pedidos_fornecedores
  for each row execute function privado.cashback_da_parte();

-- ------------------------------------------------------------------ o Pix sai sem o cashback

/**
 * O Pix para a oficina pagar a parte de uma loja: só a oficina do pedido, só depois de a loja
 * confirmar, e só com a chave que já vale (a troca recente ainda não). O valor é o subtotal menos o
 * cashback usado; quando o cashback cobriu tudo, não tem Pix (RV023).
 */
create or replace function public.pix_da_parte(p_parte bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pf public.pedidos_fornecedores%rowtype;
  px public.fornecedores_pix%rowtype;
begin
  select * into pf from public.pedidos_fornecedores where id = p_parte;
  if not found or pf.oficina_id not in (select privado.minhas_oficinas()) then
    raise exception 'Pedido não encontrado' using errcode = '42501';
  end if;
  if pf.status not in ('confirmado', 'saiu_entrega', 'entregue') then
    raise exception 'O Pix aparece quando a loja confirmar o pedido' using errcode = 'RV021';
  end if;
  if pf.subtotal - pf.cashback <= 0 then
    raise exception 'O cashback cobriu esta compra' using errcode = 'RV023';
  end if;
  perform privado.aplicar_trocas_pix(pf.fornecedor_id);
  select * into px from public.fornecedores_pix where fornecedor_id = pf.fornecedor_id;
  if not found then
    raise exception 'A loja ainda não cadastrou a chave Pix' using errcode = 'RV022';
  end if;
  return jsonb_build_object('tipo', px.tipo, 'chave', px.chave, 'nome', px.nome, 'cidade', px.cidade, 'valor', pf.subtotal - pf.cashback,
    'subtotal', pf.subtotal, 'cashback', pf.cashback, 'codigo', pf.codigo, 'trocadaEm', px.atualizado_em);
end;
$$;

revoke all on function public.pix_da_parte(bigint) from public, anon;
grant execute on function public.pix_da_parte(bigint) to authenticated;

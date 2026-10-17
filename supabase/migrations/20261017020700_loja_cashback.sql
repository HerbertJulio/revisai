-- Cashback pago pela loja: a loja escolhe um percentual (0 a 10%) e, quando um pedido dela é
-- entregue e o pagamento confirmado, a oficina ganha esse percentual de crédito para usar em
-- compras naquela loja. O livro-caixa guarda cada crédito, uso e estorno (se a loja desfaz a
-- confirmação do pagamento, o crédito volta). A oficina vê o dela; a loja, o que deu.

alter table public.fornecedores
  add column if not exists cashback_percentual numeric(4, 2) not null default 0 check (cashback_percentual >= 0 and cashback_percentual <= 10);

comment on column public.fornecedores.cashback_percentual is 'Percentual de cashback que a loja dá à oficina nos pedidos entregues e pagos (0 a 10).';

create table if not exists public.cashback_movimentos (
  id bigint generated always as identity primary key,
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  fornecedor_id bigint not null references public.fornecedores (id) on delete cascade,
  parte_id bigint references public.pedidos_fornecedores (id) on delete set null,
  valor numeric(10, 2) not null check (valor > 0),
  tipo text not null check (tipo in ('credito', 'uso', 'estorno')),
  -- o percentual que valia quando o crédito foi dado
  percentual numeric(4, 2),
  criado_em timestamptz not null default now()
);

comment on table public.cashback_movimentos is 'Livro do cashback: crédito (pedido entregue e pago), uso (numa compra) e estorno (pagamento desfeito).';

create index if not exists cashback_movimentos_oficina_idx on public.cashback_movimentos (oficina_id, fornecedor_id);
create index if not exists cashback_movimentos_loja_idx on public.cashback_movimentos (fornecedor_id, criado_em desc);
create index if not exists cashback_movimentos_parte_idx on public.cashback_movimentos (parte_id);

alter table public.cashback_movimentos enable row level security;
revoke all on public.cashback_movimentos from anon, authenticated;
grant select on public.cashback_movimentos to authenticated;
drop policy if exists "Oficina e loja veem o cashback" on public.cashback_movimentos;
create policy "Oficina e loja veem o cashback" on public.cashback_movimentos for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()));

-- ------------------------------------------------------------------ o crédito acompanha a parte

/** Entregue e pago dá o crédito; sair disso (pagamento desfeito) estorna o que foi dado. */
create or replace function privado.cashback_da_parte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes boolean := old.status = 'entregue' and old.pagamento = 'confirmado';
  v_agora boolean := new.status = 'entregue' and new.pagamento = 'confirmado';
  v_liquido numeric(10, 2);
  v_pct numeric(4, 2);
  v_valor numeric(10, 2);
begin
  if v_antes = v_agora or new.oficina_id is null then
    return null;
  end if;
  select coalesce(sum(case tipo when 'credito' then valor when 'estorno' then -valor else 0 end), 0)
    into v_liquido
    from public.cashback_movimentos where parte_id = new.id;
  if v_agora then
    if v_liquido > 0 then
      return null;
    end if;
    select cashback_percentual into v_pct from public.fornecedores where id = new.fornecedor_id;
    v_valor := round(new.subtotal * coalesce(v_pct, 0) / 100, 2);
    if v_valor > 0 then
      insert into public.cashback_movimentos (oficina_id, fornecedor_id, parte_id, valor, tipo, percentual)
      values (new.oficina_id, new.fornecedor_id, new.id, v_valor, 'credito', v_pct);
    end if;
  elsif v_liquido > 0 then
    insert into public.cashback_movimentos (oficina_id, fornecedor_id, parte_id, valor, tipo)
    values (new.oficina_id, new.fornecedor_id, new.id, v_liquido, 'estorno');
  end if;
  return null;
end;
$$;

revoke all on function privado.cashback_da_parte() from public, anon, authenticated;

drop trigger if exists pedidos_fornecedores_cashback on public.pedidos_fornecedores;
create trigger pedidos_fornecedores_cashback after update of status, pagamento on public.pedidos_fornecedores
  for each row execute function privado.cashback_da_parte();

-- ------------------------------------------------------------------ saldo

/**
 * O saldo de cashback da oficina numa loja (crédito menos uso e estorno). Sem a loja (p_fornecedor
 * nulo), o saldo em todas as lojas. Para a oficina, para a loja (só o saldo na própria loja) e para
 * a equipe.
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
    coalesce(p_oficina in (select privado.minhas_oficinas()), false)
    or (p_fornecedor is not null and p_fornecedor in (select privado.meus_fornecedores()))
    or privado.eh_equipe()
    or privado.sistema_autorizado()
  ) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select sum(case tipo when 'credito' then valor else -valor end)
      from public.cashback_movimentos
     where oficina_id = p_oficina and (p_fornecedor is null or fornecedor_id = p_fornecedor)
  ), 0);
end;
$$;

revoke all on function public.saldo_cashback(uuid, bigint) from public;
grant execute on function public.saldo_cashback(uuid, bigint) to anon, authenticated;

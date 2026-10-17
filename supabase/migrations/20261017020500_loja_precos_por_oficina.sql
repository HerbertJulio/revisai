-- Condições da loja: pedido mínimo e preço por oficina (a "tabela por cliente" das distribuidoras).
-- A loja dá um desconto na loja toda, ou num produto, ou um preço fixo num produto, para uma oficina
-- que já comprou dela. A oficina vê só as condições dela. O cálculo do pedido usa as funções
-- privado.preco_para_oficina e privado.conferir_pedido_minimo (a ligação em public.calcular_pedido
-- fica com quem cuida do pedido).

alter table public.fornecedores
  add column if not exists pedido_minimo numeric(10, 2) check (pedido_minimo > 0 and pedido_minimo <= 100000);

comment on column public.fornecedores.pedido_minimo is 'Valor mínimo da parte da loja num pedido (vazio = sem mínimo).';

create table if not exists public.precos_por_oficina (
  id bigint generated always as identity primary key,
  fornecedor_id bigint not null references public.fornecedores (id) on delete cascade,
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  -- vazio = a loja toda
  produto_id bigint references public.produtos (id) on delete cascade,
  desconto_percentual numeric(5, 2) check (desconto_percentual > 0 and desconto_percentual <= 90),
  preco numeric(10, 2) check (preco > 0 and preco <= 100000),
  observacao text check (char_length(observacao) <= 120),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint precos_por_oficina_um_valor check ((desconto_percentual is null) <> (preco is null)),
  constraint precos_por_oficina_preco_de_produto check (preco is null or produto_id is not null),
  constraint precos_por_oficina_unico unique nulls not distinct (fornecedor_id, oficina_id, produto_id)
);

comment on table public.precos_por_oficina is 'Desconto (na loja toda ou num produto) ou preço fixo (num produto) que uma loja dá a uma oficina.';

create index if not exists precos_por_oficina_oficina_idx on public.precos_por_oficina (oficina_id);

alter table public.precos_por_oficina enable row level security;
revoke all on public.precos_por_oficina from anon, authenticated;
grant select, insert, update, delete on public.precos_por_oficina to authenticated;

drop policy if exists "Loja e oficina veem as condições" on public.precos_por_oficina;
drop policy if exists "Loja combina condições com quem já comprou" on public.precos_por_oficina;
drop policy if exists "Loja muda as próprias condições" on public.precos_por_oficina;
drop policy if exists "Loja tira as próprias condições" on public.precos_por_oficina;
drop policy if exists "Equipe cuida das condições" on public.precos_por_oficina;
create policy "Loja e oficina veem as condições" on public.precos_por_oficina for select to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()) or oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe()));
create policy "Loja combina condições com quem já comprou" on public.precos_por_oficina for insert to authenticated
  with check (
    fornecedor_id in (select privado.meus_fornecedores())
    and (produto_id is null or privado.fornecedor_do_produto(produto_id) = fornecedor_id)
    and exists (select 1 from public.pedidos_fornecedores pf where pf.fornecedor_id = precos_por_oficina.fornecedor_id and pf.oficina_id = precos_por_oficina.oficina_id)
  );
create policy "Loja muda as próprias condições" on public.precos_por_oficina for update to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()))
  with check (fornecedor_id in (select privado.meus_fornecedores()) and (produto_id is null or privado.fornecedor_do_produto(produto_id) = fornecedor_id));
create policy "Loja tira as próprias condições" on public.precos_por_oficina for delete to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()));
create policy "Equipe cuida das condições" on public.precos_por_oficina for all to authenticated
  using ((select privado.eh_equipe(array['suporte']))) with check ((select privado.eh_equipe(array['suporte'])));

-- a condição não muda de loja nem de oficina; a data de mudança acompanha
create or replace function privado.regras_do_preco_por_oficina()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fornecedor_id is distinct from old.fornecedor_id or new.oficina_id is distinct from old.oficina_id then
    raise exception 'A condição não muda de loja nem de oficina' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists precos_por_oficina_regras on public.precos_por_oficina;
create trigger precos_por_oficina_regras before update on public.precos_por_oficina
  for each row execute function privado.regras_do_preco_por_oficina();

-- ------------------------------------------------------------------ para o cálculo do pedido

/**
 * O preço do produto para a oficina: o preço fixo combinado para aquele produto ou, sem ele, o
 * maior desconto combinado (no produto ou na loja toda) sobre o preço dado. Sem condição, o preço
 * dado. Roda como quem chama: a oficina só enxerga as condições dela.
 */
create or replace function privado.preco_para_oficina(p_produto bigint, p_oficina uuid, p_preco numeric)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  with produto as (
    select p.fornecedor_id from public.produtos p where p.id = p_produto
  ),
  condicoes as (
    select c.produto_id, c.preco, c.desconto_percentual
      from public.precos_por_oficina c, produto
     where c.fornecedor_id = produto.fornecedor_id and c.oficina_id = p_oficina
       and (c.produto_id = p_produto or c.produto_id is null)
  )
  select coalesce(
    (select min(preco) from condicoes where produto_id = p_produto and preco is not null),
    round(p_preco * (1 - coalesce((select max(desconto_percentual) from condicoes where desconto_percentual is not null), 0) / 100), 2)
  );
$$;

/**
 * Confere o pedido mínimo de cada loja nos itens já calculados ([{fornecedor_id, preco_unitario,
 * quantidade}]). Recusa com RV030 dizendo a loja e o mínimo.
 */
create or replace function privado.conferir_pedido_minimo(p_itens jsonb)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select f.id, f.nome, f.pedido_minimo, sum((i ->> 'preco_unitario')::numeric * (i ->> 'quantidade')::numeric) as soma
      from jsonb_array_elements(case when jsonb_typeof(p_itens) = 'array' then p_itens else '[]'::jsonb end) i
      join public.fornecedores f on f.id = (i ->> 'fornecedor_id')::bigint
     where f.pedido_minimo is not null
     group by f.id, f.nome, f.pedido_minimo
  loop
    if r.soma < r.pedido_minimo then
      raise exception 'O pedido mínimo da % é de R$ %', r.nome, replace(to_char(r.pedido_minimo, 'FM9999990D00'), '.', ',')
        using errcode = 'RV030', detail = r.id::text;
    end if;
  end loop;
end;
$$;

revoke all on function privado.preco_para_oficina(bigint, uuid, numeric), privado.conferir_pedido_minimo(jsonb) from public, anon;
grant execute on function privado.preco_para_oficina(bigint, uuid, numeric), privado.conferir_pedido_minimo(jsonb) to authenticated;

-- ------------------------------------------------------------------ as oficinas clientes da loja

/** As oficinas que já compraram da loja (para a loja combinar condições): pedidos, total e o último. */
create or replace function public.loja_clientes(p_fornecedor bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if privado.papel_no_fornecedor(p_fornecedor) is null and not privado.eh_equipe() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'oficinaId', c.oficina_id, 'nome', c.nome, 'cidade', c.cidade, 'uf', c.uf,
             'pedidos', c.pedidos, 'total', c.total, 'ultimo', c.ultimo
           ) order by c.ultimo desc)
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
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.loja_clientes(bigint) from public, anon;
grant execute on function public.loja_clientes(bigint) to authenticated;

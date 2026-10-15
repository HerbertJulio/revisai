-- Ajuste do preço combinado no alerta: a resposta vale para um pedido só, enquanto o alerta está
-- aberto (as lojas respondem em até 48 horas e a oficina tem mais um dia para escolher). Se a
-- resposta não vale mais, o pedido não sai (em vez de sair com o preço normal sem a oficina saber).

create or replace function public.calcular_pedido()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_calculados jsonb := '[]'::jsonb;
  v_produto_id bigint;
  v_quantidade integer;
  v_nome text;
  v_preco numeric(10, 2);
  v_fornecedor_id bigint;
  v_fornecedor text;
  v_promocional numeric(10, 2);
  v_combinado numeric(10, 2);
  v_unitario numeric(10, 2);
  v_soma numeric(12, 2) := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for v_item in select value from jsonb_array_elements(new.itens)
  loop
    if jsonb_typeof(v_item -> 'produto_id') is distinct from 'number'
       or jsonb_typeof(v_item -> 'quantidade') is distinct from 'number' then
      raise exception 'Item de pedido inválido' using errcode = '22023';
    end if;
    v_produto_id := (v_item ->> 'produto_id')::bigint;
    v_quantidade := (v_item ->> 'quantidade')::integer;
    if v_quantidade < 1 or v_quantidade > 999 then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;

    select p.nome, p.preco, p.fornecedor_id, f.nome
      into v_nome, v_preco, v_fornecedor_id, v_fornecedor
      from public.produtos p
      join public.fornecedores f on f.id = p.fornecedor_id
     where p.id = v_produto_id and p.ativo and f.ativo;
    if not found then
      raise exception 'Produto % indisponível', v_produto_id using errcode = '22023';
    end if;

    select min(pr.preco_promocional) into v_promocional
      from public.promocoes pr
     where pr.produto_id = v_produto_id
       and pr.ativo
       and v_hoje between pr.inicio and pr.fim
       and v_quantidade >= pr.quantidade_minima;

    v_combinado := null;
    if jsonb_typeof(v_item -> 'resposta_id') = 'string' then
      select r.preco into v_combinado
        from public.alertas_respostas r
        join public.alertas_preco a on a.id = r.alerta_id
       where r.id = (v_item ->> 'resposta_id')::uuid
         and r.tipo in ('aceita', 'contraproposta')
         and r.produto_id = v_produto_id
         and r.fornecedor_id = v_fornecedor_id
         and r.status = 'enviada'
         and r.pedido_id is null
         and a.aparelho_id = new.aparelho_id
         and a.status = 'aberto'
         and a.expira_em > now() - interval '1 day'
         and v_quantidade >= coalesce(r.quantidade_minima, 1);
      -- quem manda a resposta espera o preço combinado: sem ele, o pedido não sai
      if v_combinado is null then
        raise exception 'A proposta não vale mais' using errcode = 'RV001';
      end if;
    end if;

    v_unitario := least(v_preco, coalesce(v_promocional, v_preco), coalesce(v_combinado, v_preco));
    v_soma := v_soma + v_unitario * v_quantidade;
    v_calculados := v_calculados || jsonb_build_array(jsonb_build_object(
      'produto_id', v_produto_id,
      'nome', v_nome,
      'fornecedor_id', v_fornecedor_id,
      'fornecedor', v_fornecedor,
      'quantidade', v_quantidade,
      'preco_unitario', v_unitario,
      'promocao', coalesce(v_promocional < v_preco, false),
      'combinado', coalesce(v_combinado is not null and v_combinado <= least(v_preco, coalesce(v_promocional, v_preco)), false)
    ) || case when v_combinado is not null then jsonb_build_object('resposta_id', v_item ->> 'resposta_id') else '{}'::jsonb end);
  end loop;

  new.itens := v_calculados;
  new.total := v_soma;
  new.status := 'novo';
  new.criado_em := now();
  return new;
end;
$$;

revoke all on function public.calcular_pedido() from public, anon, authenticated;

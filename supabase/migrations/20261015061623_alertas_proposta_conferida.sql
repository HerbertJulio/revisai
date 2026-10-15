-- O pedido com o preço combinado confere a proposta inteira que a oficina viu: o produto, o preço e a
-- quantidade mínima. Se a loja mudou qualquer um deles depois, o pedido não sai (RV002) e a oficina
-- confirma a proposta nova. O teto da quantidade passa a ser pelo valor (5 vezes o valor negociado),
-- para valer igual quando a loja oferece outra embalagem (um balde de 20 L pedido, frascos de 1 L
-- oferecidos).
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
  v_minimo integer;
  v_produto_resposta bigint;
  v_qtd_alerta integer;
  v_alvo numeric(10, 2);
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
      select r.preco, r.quantidade_minima, r.produto_id, a.quantidade, a.preco_alvo
        into v_combinado, v_minimo, v_produto_resposta, v_qtd_alerta, v_alvo
        from public.alertas_respostas r
        join public.alertas_preco a on a.id = r.alerta_id
       where r.id = (v_item ->> 'resposta_id')::uuid
         and r.tipo in ('aceita', 'contraproposta')
         and r.fornecedor_id = v_fornecedor_id
         and r.status = 'enviada'
         and r.pedido_id is null
         and a.aparelho_id = new.aparelho_id
         and a.status = 'aberto'
         and a.expira_em > now() - interval '1 day';
      -- quem manda a resposta espera o preço combinado: sem ele, o pedido não sai
      if v_combinado is null then
        raise exception 'A proposta não vale mais' using errcode = 'RV001';
      end if;
      -- a loja mudou a proposta (produto, preço ou mínimo) depois que a oficina viu
      if v_produto_resposta is distinct from v_produto_id
         or (jsonb_typeof(v_item -> 'preco_esperado') = 'number' and v_combinado <> (v_item ->> 'preco_esperado')::numeric)
         or (jsonb_typeof(v_item -> 'minimo_esperado') = 'number' and coalesce(v_minimo, 1) <> (v_item ->> 'minimo_esperado')::numeric) then
        raise exception 'A loja mudou a proposta' using errcode = 'RV002';
      end if;
      -- o preço combinado vale do mínimo da loja até a quantidade negociada, com folga (pelo valor)
      if v_quantidade < coalesce(v_minimo, 1)
         or v_quantidade * v_combinado > greatest(v_qtd_alerta * v_alvo, coalesce(v_minimo, 1) * v_combinado) * 5 then
        raise exception 'Quantidade fora da proposta' using errcode = 'RV003';
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

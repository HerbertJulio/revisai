-- O que a loja informa e acompanha além do preço:
-- - estoque por produto (vazio = a loja não controla), que baixa sozinho quando a loja confirma um
--   pedido e volta se ele for cancelado depois;
-- - código próprio do produto (o da planilha da loja) e em que carros a peça serve;
-- - prazo de entrega da loja e se ela quer aviso por WhatsApp;
-- - a importação da planilha de produtos numa transação só, com as regras de quem importa.

-- ------------------------------------------------------------------ produtos e loja

alter table public.produtos
  add column if not exists codigo text check (char_length(codigo) between 1 and 60),
  add column if not exists estoque integer check (estoque between 0 and 1000000),
  add column if not exists aplicacoes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(aplicacoes) = 'array' and jsonb_array_length(aplicacoes) <= 100 and octet_length(aplicacoes::text) <= 20000);

-- o código é da loja: dois produtos da mesma loja não repetem o código (vazio pode repetir)
create unique index if not exists produtos_codigo_da_loja on public.produtos (fornecedor_id, codigo);

alter table public.fornecedores
  add column if not exists prazo_entrega_horas integer check (prazo_entrega_horas between 1 and 720),
  add column if not exists avisar_whatsapp boolean not null default true;

comment on column public.produtos.estoque is 'Unidades em estoque; vazio quando a loja não controla. Baixa ao confirmar o pedido.';
comment on column public.produtos.aplicacoes is 'Em que carros a peça serve: [{texto, marca, modelo, anoDe, anoAte}].';
comment on column public.fornecedores.prazo_entrega_horas is 'Em até quantas horas a loja entrega na região dela.';

-- ------------------------------------------------------------------ estoque acompanha o pedido

/** Confirmado (ou a caminho, ou entregue) reserva o estoque; voltar daí (cancelar) devolve. */
create or replace function privado.loja_estoque_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes boolean := old.status in ('confirmado', 'saiu_entrega', 'entregue');
  v_agora boolean := new.status in ('confirmado', 'saiu_entrega', 'entregue');
  v_sinal integer;
  i jsonb;
begin
  if v_antes = v_agora then
    return null;
  end if;
  v_sinal := case when v_agora then -1 else 1 end;
  for i in select * from jsonb_array_elements(case when jsonb_typeof(new.itens) = 'array' then new.itens else '[]'::jsonb end)
  loop
    begin
      if coalesce((i ->> 'fornecedor_id')::bigint, new.fornecedor_id) = new.fornecedor_id then
        update public.produtos
           set estoque = greatest(estoque + v_sinal * greatest(floor(coalesce((i ->> 'quantidade')::numeric, 0))::integer, 0), 0)
         where id = (i ->> 'produto_id')::bigint and fornecedor_id = new.fornecedor_id and estoque is not null;
      end if;
    exception when others then
      -- um item estranho não segura a confirmação do pedido
      null;
    end;
  end loop;
  return null;
end;
$$;

revoke all on function privado.loja_estoque_do_pedido() from public, anon, authenticated;

drop trigger if exists pedidos_fornecedores_estoque on public.pedidos_fornecedores;
create trigger pedidos_fornecedores_estoque after update of status on public.pedidos_fornecedores
  for each row execute function privado.loja_estoque_do_pedido();

-- ------------------------------------------------------------------ planilha de produtos

/**
 * Importa a planilha da loja numa transação só: cada linha com id muda aquele produto (que precisa
 * ser da loja), as outras viram produtos novos. Roda como quem chamou, com as mesmas regras do app.
 */
create or replace function public.loja_importar_produtos(p_fornecedor bigint, p_produtos jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  p jsonb;
  v_novos integer := 0;
  v_mudados integer := 0;
  v_id bigint;
begin
  if p_fornecedor not in (select privado.meus_fornecedores()) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if jsonb_typeof(p_produtos) <> 'array' or jsonb_array_length(p_produtos) > 1000 then
    raise exception 'Planilha inválida' using errcode = '22023';
  end if;
  for p in select * from jsonb_array_elements(p_produtos)
  loop
    v_id := nullif(p ->> 'id', '')::bigint;
    if v_id is not null then
      update public.produtos set
        codigo = nullif(p ->> 'codigo', ''),
        categoria = p ->> 'categoria',
        nome = p ->> 'nome',
        marca = nullif(p ->> 'marca', ''),
        descricao = nullif(p ->> 'descricao', ''),
        unidade = p ->> 'unidade',
        conteudo = nullif(p ->> 'conteudo', '')::numeric,
        preco = (p ->> 'preco')::numeric,
        estoque = nullif(p ->> 'estoque', '')::integer,
        ativo = coalesce((p ->> 'ativo')::boolean, true),
        especificacao = coalesce(p -> 'especificacao', '{}'::jsonb),
        aplicacoes = coalesce(p -> 'aplicacoes', '[]'::jsonb),
        intervalo_km = nullif(p ->> 'intervalo_km', '')::integer,
        intervalo_meses = nullif(p ->> 'intervalo_meses', '')::integer
      where id = v_id and fornecedor_id = p_fornecedor;
      if not found then
        raise exception 'Produto % não é desta loja', v_id using errcode = '42501';
      end if;
      v_mudados := v_mudados + 1;
    else
      insert into public.produtos (fornecedor_id, codigo, categoria, nome, marca, descricao, unidade, conteudo, preco, estoque, ativo, especificacao, aplicacoes, intervalo_km, intervalo_meses)
      values (p_fornecedor, nullif(p ->> 'codigo', ''), p ->> 'categoria', p ->> 'nome', nullif(p ->> 'marca', ''), nullif(p ->> 'descricao', ''), p ->> 'unidade',
              nullif(p ->> 'conteudo', '')::numeric, (p ->> 'preco')::numeric, nullif(p ->> 'estoque', '')::integer, coalesce((p ->> 'ativo')::boolean, true),
              coalesce(p -> 'especificacao', '{}'::jsonb), coalesce(p -> 'aplicacoes', '[]'::jsonb),
              nullif(p ->> 'intervalo_km', '')::integer, nullif(p ->> 'intervalo_meses', '')::integer);
      v_novos := v_novos + 1;
    end if;
  end loop;
  return jsonb_build_object('novos', v_novos, 'mudados', v_mudados);
end;
$$;

revoke all on function public.loja_importar_produtos(bigint, jsonb) from public, anon;
grant execute on function public.loja_importar_produtos(bigint, jsonb) to authenticated;

-- Compras formais entram como uma coleção nova dos registros da oficina: pedido de compra ao
-- fornecedor que, ao ser recebido, dá entrada no estoque e abre a conta a pagar. Como envolve
-- custo e conta a pagar (dinheiro), é restrita: só o dono e o gerente veem e gravam, no banco e
-- não só na tela, como os lançamentos.

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
    'comissoes', 'clube',
    'comprasPedidos'
  ]);
$$;

create or replace function privado.colecao_restrita(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p = any (array['lancamentos', 'clubeCobrancas', 'comissoes', 'clube', 'comprasPedidos']);
$$;
revoke all on function privado.colecao_restrita(text) from public, anon;
grant execute on function privado.colecao_restrita(text) to authenticated;

-- Índices das chaves estrangeiras dos alertas: apagar ou mudar um produto ou um pedido não varre as
-- tabelas de alertas inteiras para conferir as referências.
create index if not exists alertas_preco_produto_idx on public.alertas_preco (produto_id);
create index if not exists alertas_preco_resposta_idx on public.alertas_preco (resposta_escolhida);
create index if not exists alertas_respostas_pedido_idx on public.alertas_respostas (pedido_id);
create index if not exists alertas_respostas_produto_idx on public.alertas_respostas (produto_id);

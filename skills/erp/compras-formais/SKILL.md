---
nome: erp/compras-formais
dominio: erp
produto: Oficina ERP
status: parcial
arquivos:
  - lib/compras.ts
  - lib/store.ts (ação receberCompra)
  - lib/registros-oficina.ts (PedidoCompra, coleção comprasPedidos)
  - components/oficina/compras/Compras.tsx
  - app/oficina/compras/page.tsx
  - components/oficina/extensoes/compras.tsx
  - supabase/migrations/20261027000000_compras_formais.sql
---

# Compras formais

Fechar o ciclo de compra: pedir ao fornecedor, receber, dar entrada no estoque e gerar a
conta a pagar — tudo ligado. **É o primeiro módulo de ERP a construir.**

## O que vai fazer
1. **Pedido de compra:** a oficina monta um pedido a um fornecedor (itens, quantidade, custo combinado). Pode nascer da compra sugerida do estoque (`lib/estoque.ts`) ou do marketplace.
2. **Recebimento:** quando a peça chega, confere o que veio contra o pedido (total ou parcial).
3. **Entrada no estoque:** o recebimento dá entrada com **quantidade e custo** — a base para o custo médio (ver `erp/custo-estoque`).
4. **Conta a pagar:** o recebimento gera um lançamento `pagar` no financeiro (ver `oficina/financeiro`), com vencimento, alimentando o fluxo de caixa (ver `erp/fluxo-caixa`).

## Banco (proposta)
- `compras_pedidos` (oficina_id, fornecedor, status: rascunho/enviado/recebido_parcial/recebido/cancelado).
- `compras_itens` (produto/item de estoque, qtd pedida, qtd recebida, custo unitário).
- `compras_recebimentos` (data, itens recebidos) → dispara entrada de estoque + conta a pagar.
- RLS por oficina. Entrada de estoque e conta a pagar numa transação só (função do banco).

## Regras e invariantes
- Recebimento nunca entra mais do que foi pedido sem confirmação.
- Entrada de estoque e conta a pagar são atômicas: ou as duas, ou nenhuma.
- Cada entrada carrega o custo, para o custo médio funcionar.

## Como se liga ao que já existe
- `oficina/estoque` ganha a entrada formal (hoje só tem saldo e custo da última compra).
- `oficina/financeiro` ganha a conta a pagar automática (hoje é manual).
- `oficina/compras` (marketplace) pode virar pedido de compra com um toque.

## Segurança e LGPD
Sem dado pessoal além do fornecedor. Ver `plataforma/seguranca-lgpd`.

## Depende de
`oficina/estoque`, `oficina/financeiro`, `oficina/compras`.

## Feito (v1)
Pedido de compra como coleção local-first `comprasPedidos` (sincroniza e é restrita a dono/gerente
no banco). Tela em `/oficina/compras` (no menu "Mais"): monta o pedido com itens ligáveis ao
estoque e recebe. O recebimento (`receberCompra` no store) dá entrada no estoque com o custo
(movimento origem `compra`) e abre a conta a pagar (`Lancamento` tipo `pagar`, categoria
`fornecedor`), tudo numa gravação só. Lógica pura e testada em `lib/compras.ts` (`tests/compras.test.ts`).

## A fazer
Recebimento parcial (hoje recebe o pedido inteiro de uma vez). Dar entrada por foto da nota
(OCR com a IA). O custo médio ponderado vem no próximo módulo (`erp/custo-estoque`); hoje a
entrada guarda o custo da compra como custo da última entrada. Teste de banco da RLS restrita.

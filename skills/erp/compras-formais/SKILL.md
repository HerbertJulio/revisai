---
nome: erp/compras-formais
dominio: erp
produto: Oficina ERP
status: a-construir
arquivos:
  - (a criar) lib/compras.ts
  - (a criar) app/oficina/compras
  - (a criar) supabase/migrations/..._compras.sql
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

## A fazer
Tudo. Ordem: migração + função atômica → `lib/compras.ts` (puro + servidor) → telas em `app/oficina/compras` → ligar ao estoque e ao financeiro.

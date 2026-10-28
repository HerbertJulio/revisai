---
nome: oficina/estoque
dominio: oficina
produto: Oficina Pro
status: parcial
arquivos:
  - lib/estoque.ts
  - lib/kit-revisao.ts
  - lib/relatorios.ts
---

# Estoque

Quanto tem de cada peça, o que vai faltar e o que comprar.

## O que faz
Controla o saldo de peças e óleo (óleo em litros, o resto em unidades), prevê o que vai
faltar pela demanda e sugere a compra na loja do Revisaí.

## Lógica (lib)
- `lib/estoque.ts` — saldo, previsão (`preverEstoque`), compra sugerida (`compraSugerida`) e o **custo da última compra** por item.
- `lib/kit-revisao.ts` — o que o kit de revisão consome do estoque e o que falta comprar.
- `lib/relatorios.ts` — margem: preço cobrado contra o custo do item (o da última compra).

## Banco
- Itens de estoque no estado local sincronizado; movimentações ligadas às ordens.

## Regras e invariantes
- Óleo conta em litros mesmo comprado em frasco/galão/balde.
- Hoje o custo é o **da última compra**, não o médio — ponto que o ERP vai evoluir.

## Como estender
Entrada de estoque nova deve registrar quantidade **e** custo, para o custo médio futuro
funcionar (ver `erp/custo-estoque`).

## Segurança e LGPD
Sem dado pessoal. Acesso por RLS da oficina.

## Depende de
`oficina/ordens` (baixa por serviço), `oficina/compras` (entrada).

## A fazer
Custo médio ponderado, posição de estoque valorizada e CMV — em `erp/custo-estoque`.
Entrada formal de estoque vinda de `erp/compras-formais`.

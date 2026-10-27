---
nome: erp/contabilidade
dominio: erp
produto: Oficina ERP
status: parcial
arquivos:
  - lib/contabilidade.ts
  - components/oficina/gestao/Dre.tsx
  - tests/contabilidade.test.ts
---

# Resultado do período (DRE)

Quanto a oficina ganhou e gastou no mês, por categoria, e o que sobrou.

## Feito (v1)
- `lib/contabilidade.ts` (puro, testado): `dre(lancamentos, periodo, regime)` agrupa os lançamentos em receitas e despesas por categoria e calcula o resultado. Regime de **caixa** (pelo que foi pago/recebido, por `pagoEm`) ou de **competência** (pelo que venceu, por `vencimento`).
- Tela em **Gestão → Resultado** (`/oficina/gestao`): o mês corrente, com o botão para alternar caixa/competência.

## Regras e invariantes
- Usa as categorias que o financeiro já tem (`lib/financeiro` `CATEGORIAS`); o "plano de contas" v1 é esse agrupamento por categoria.
- Caixa só conta lançamentos com `pagoEm`; competência conta pela data de vencimento, pago ou não.

## A fazer
Plano de contas de verdade (grupos e subgrupos) e centro de custo. Comparar meses e exportar.

## Depende de
`oficina/financeiro` (os lançamentos e as categorias).

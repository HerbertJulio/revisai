---
nome: erp/fluxo-caixa
dominio: erp
produto: Oficina ERP
status: parcial
arquivos:
  - lib/fluxo-caixa.ts
  - components/oficina/gestao/FluxoCaixa.tsx
  - tests/fluxo-caixa.test.ts
---

# Fluxo de caixa projetado

O que ainda tem para entrar e sair, o que está atrasado, e o saldo dia a dia.

## Feito (v1)
- `lib/fluxo-caixa.ts` (puro, testado): `fluxoProjetado(lancamentos, hoje, ate)` soma o que está em aberto a receber e a pagar, separa o que já venceu (atrasado) e projeta o saldo acumulado por dia de vencimento, começando pelo atrasado.
- Tela em **Gestão → Fluxo de caixa** (`/oficina/gestao`): a receber, a pagar, saldo projetado, o atrasado e a lista por dia nos próximos 60 dias.

## Regras e invariantes
- "Em aberto" é o lançamento sem `pagoEm`. O atrasado entra como saldo inicial da projeção.

## A fazer
Saldo inicial do caixa de hoje como ponto de partida. Alerta quando a projeção fica negativa.

## Depende de
`oficina/financeiro` (contas a pagar e a receber).

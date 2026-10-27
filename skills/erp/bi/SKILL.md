---
nome: erp/bi
dominio: erp
produto: Oficina ERP
status: parcial
arquivos:
  - lib/indicadores.ts
  - components/oficina/gestao/Painel.tsx
  - tests/indicadores.test.ts
---

# Painel gerencial (indicadores)

Os números do negócio num relance: quanto faturou, quantas ordens, ticket médio e o que está atrasado.

## Feito (v1)
- `lib/indicadores.ts` (puro, testado): `indicadoresDoMes` (faturamento das ordens concluídas no mês, nº de ordens, ticket médio e a receber em atraso) e `faturamentoPorMes` (os últimos meses).
- Tela em **Gestão → Painel** (`/oficina/gestao`, a primeira aba): os quatro números do mês e o faturamento dos últimos 6 meses em barras.

## Regras e invariantes
- Faturamento conta a ordem de serviço `concluida` pela data de conclusão (`concluidoEm`), pelo total do documento.
- Inadimplência é a conta a receber em aberto e vencida.

## A fazer
Curva ABC de produtos e serviços, giro de estoque, comparação entre meses e metas. Pode virar um
painel do tipo Dashboard quando quiser gráficos mais ricos.

## Depende de
`oficina/ordens`, `oficina/financeiro`.

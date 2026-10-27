---
nome: erp/custo-estoque
dominio: erp
produto: Oficina ERP
status: parcial
arquivos:
  - lib/custo-estoque.ts
  - components/oficina/gestao/EstoqueValorizado.tsx
  - components/oficina/gestao/Gestao.tsx
  - app/oficina/gestao/page.tsx
  - tests/custo-estoque.test.ts
---

# Custo e estoque valorizado

Quanto de dinheiro está parado em peças e quanto saiu em peças no mês (CMV).

## Feito (v1)
- `lib/custo-estoque.ts` (puro, testado): `posicaoValorizada` (valor total, por item e por categoria, e quantos itens estão sem custo), `consumoValorizado` (CMV do período pelas saídas de estoque) e `custoMedio` (média ponderada, pronto para ligar no núcleo).
- Tela em **Gestão → Estoque** (`/oficina/gestao`, no menu "Mais", só dono e gerente): dinheiro parado, CMV do mês, por categoria e os maiores valores.

## Regras e invariantes
- Só entra no valor o item com quantidade e custo. Itens sem custo são contados à parte.
- O CMV de hoje valoriza a saída pelo custo atual do item (aproximação; fica fiel quando o custo médio estiver no núcleo).

## A fazer
Ligar `custoMedio` no núcleo do estoque: `aplicarMovimento` (lib/estoque) e `recalcularItem`
(lib/sincronia-dados) hoje gravam o custo da última compra. A troca é de uma linha em cada, mas
mexe nos valores esperados de alguns testes acoplados ao catálogo de exemplo (`tests/estoque`,
`tests/sincronia*`), então é um passo próprio e cuidadoso. O determinismo da sincronização não
muda (o replay continua dobrando em ordem fixa). Depois, guardar o custo de cada saída para o CMV
ficar exato.

## Depende de
`oficina/estoque`, `erp/compras-formais` (as entradas que alimentam o custo).

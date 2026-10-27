---
nome: oficina/mecanicos
dominio: oficina
produto: Oficina ERP
status: a-construir
arquivos:
  - (a criar) app/oficina/mecanicos
  - (a criar) lib/oficina/mecanicos.ts
  - lib/conta-dados.ts
---

# Sistema dos mecânicos (PCM/PCP, frente de loja, permissões)

Dar ao mecânico uma forma própria de trabalhar, com o que a oficina deixar ele ver e fazer.

## O que faz (planejado)
O papel `mecanico` já existe (vê clientes, carros, ordens e estoque). Em cima dele:

- **Dois modos de trabalho:** pelo **agente no WhatsApp** (já existe, ver `plataforma/ia`) ou por uma **frente de loja** nova — tela enxuta de bancada onde o mecânico abre a ordem, busca peças e serviços, aponta o que usou e fecha.
- **A oficina configura por mecânico:** ver preço e custo (liga/desliga — desligado, ele vê peça e serviço sem valores), e permissões (abrir ordem, lançar, dar baixa no estoque, fechar, dar desconto).
- **Apontamento de horas:** início e fim de cada serviço, para medir tempo e produtividade.
- **PCM/PCP:** plano de manutenção por carro (perto dos avisos) e fila de ordens por etapa (na fila, em execução, parada esperando peça, pronta), com o mecânico responsável e o tempo em cada etapa.
- **Relatórios com filtros:** rendimento por mecânico e período, tempo médio por serviço, consumo de peças, ordens paradas. Filtros por data, mecânico, serviço e carro.

## Banco (planejado)
- Permissões por membro em `oficina_membros` (flags: `ver_preco`, `pode_fechar`, etc.) com RLS garantindo que o preço não vaza quando desligado.
- Apontamento: tabela de etapas da ordem com `inicio`/`fim` e mecânico.

## Regras e invariantes
- Quando "ver preço" está desligado, o valor **não pode** chegar ao cliente do banco (RLS/coluna), não basta esconder na tela.
- Mecânico só vê e mexe nas ordens da oficina dele.

## Decisões abertas (ver blueprint dos painéis)
1. Frente de loja: tela dentro do app da oficina ou acesso simplificado à parte?
2. Apontamento: cronômetro simples primeiro, ou já com as etapas do PCP?
3. Profundidade do PCM/PCP agora vs. depois.

## Depende de
`oficina/ordens`, `oficina/estoque`, `plataforma/auth-paineis`.

## A fazer
Tudo — módulo a construir. Começa pelas permissões + frente de loja.

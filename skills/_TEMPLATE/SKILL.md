---
nome: <grupo>/<modulo>
dominio: <oficina | loja | plataforma | automacoes | erp | admin>
produto: <qual pacote vendável usa este módulo>
status: <pronto | parcial | a-construir>
arquivos:
  - <caminho/do/arquivo/principal>
---

# <Nome do módulo>

Uma frase: o que este recurso resolve para o usuário.

## O que faz
O comportamento, do ponto de vista de quem usa. Sem jargão.

## Telas e rotas
- `app/...` — o que cada tela faz.

## Lógica (lib)
- `lib/...` — funções principais e o que elas garantem.

## Banco
- Tabelas: `...`
- Funções (RPC): `...`
- RLS: quem pode ler e escrever.

## Regras e invariantes
O que não pode quebrar nunca (ex.: "não baixa estoque abaixo de zero", "só o dono muda o plano").

## Integrações e chaves
Serviços externos e as variáveis de ambiente que eles usam. Grátis ou pago.

## Como estender
O caminho certo para adicionar algo aqui, e o que evitar.

## Segurança e LGPD
Pontos sensíveis deste módulo e dados pessoais que ele toca.

## Depende de
Outros módulos que este usa (pelos contratos deles, não por dentro).

## A fazer
Pendências conhecidas.

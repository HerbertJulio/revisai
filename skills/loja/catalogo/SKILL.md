---
nome: loja/catalogo
dominio: loja
produto: Loja
status: parcial
arquivos:
  - lib/loja/produtos.ts
  - lib/loja/planilha.ts
  - app/fornecedor/acoes.ts
---

# Catálogo da loja

Os produtos que a loja vende, com foto, preço, estoque e aplicação nos carros.

## O que faz
A loja cadastra produtos um a um ou por planilha, põe foto, preço, estoque e em quais carros
a peça serve. O produto ativo aparece na vitrine do marketplace para as oficinas.

## Lógica (lib)
- `lib/loja/produtos.ts` — `salvarProduto` (cadastro manual, aceita qualquer produto, mesmo fora do ERP), `importarProdutos` (planilha), `enviarFoto` (Storage, bucket `produtos`; valida tipo e assinatura, até 1 MB), `salvarPromocao`.
- `lib/loja/planilha.ts` — conferência da planilha.

## Banco
- Tabela `produtos` (por `fornecedor_id`, RLS da loja). `promocoes`. Foto no Storage público `produtos`.

## Regras e invariantes
- O código do produto é único por loja (erro `23505`).
- Hoje a foto é **opcional** e vem num passo separado (precisa do produto já criado).

## Mudança pedida: foto obrigatória
O produto não vai para a vitrine sem foto. Caminho recomendado: o produto pode ser salvo como
rascunho, mas só fica **ativo/anunciável** com foto. Produtos antigos sem foto: decidir se
continuam publicados ou entram em rascunho até ter foto (decisão no blueprint dos painéis).

## Como estender
Campo novo entra no `esquemaProdutoDaLoja` (Zod) e na linha do banco. Deixar o cadastro
manual sempre visível, para anunciar item que não vem do ERP.

## Segurança e LGPD
Foto validada por tipo e assinatura de arquivo. Sem dado pessoal. Ver `plataforma/seguranca-lgpd`.

## Depende de
`loja/anuncios`, `plataforma/dados-rls`.

## A fazer
Tornar a foto obrigatória para anunciar. Deixar o cadastro manual mais visível na vitrine.

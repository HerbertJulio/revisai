---
nome: loja/anuncios
dominio: loja
produto: Loja
status: pronto
arquivos:
  - lib/loja/produtos.ts
  - lib/loja/anuncios.ts
  - lib/planos-fornecedor.ts
---

# Anúncios da loja

Como a loja aparece e se destaca no marketplace para as oficinas.

## O que faz
Quatro formas de anunciar:
- **Vitrine** — o produto ativo aparece no marketplace. Grátis.
- **Impulso** — destaca um produto por 7, 15 ou 30 dias, por período fixo ou por clique (CPC com teto diário). Pago; a equipe aprova.
- **Destaque** — plano mensal; o pedido vai para a equipe como um interessado.
- **Promoção** — preço promocional com quantidade mínima e prazo.

## Lógica (lib)
- `lib/loja/produtos.ts` — `pedirImpulso` (CPC mínimo, teto diário), `pedirDestaque`, `salvarPromocao`.
- `lib/loja/anuncios.ts` — impressões e cliques (`registrarImpressoes`, `registrarClique`).
- `lib/planos-fornecedor.ts` — preços e validade do impulso.

## Banco
- `impulsos` (status `pedido` → aprovado pela equipe), `promocoes`, `anuncios_impressoes`, `anuncios_cliques`. Tudo por `fornecedor_id` com RLS.

## Regras e invariantes
- No CPC, a loja paga pelos cliques dentro do teto do dia, não pelo período.
- Produto precisa estar ativo para impulsionar (e, com a mudança pedida, ter foto).
- Até 5 pedidos de impulso abertos por loja.

## Como estender
Tipo de anúncio novo (ex.: combo de produtos, vitrine da marca) entra aqui com seu preço em
`lib/planos-fornecedor.ts` e passa pela moderação do admin.

## Segurança e LGPD
Sem dado pessoal. A oficina que vê o anúncio não é exposta à loja além do permitido (ver `lib/sugestoes.ts`).

## Depende de
`loja/catalogo`, `admin/global` (moderação), `plataforma/dados-rls`.

## A fazer
Avaliar tipos de anúncio novos (decisão no blueprint dos painéis).

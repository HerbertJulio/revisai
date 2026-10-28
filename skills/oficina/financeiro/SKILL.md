---
nome: oficina/financeiro
dominio: oficina
produto: Oficina Essencial
status: pronto
arquivos:
  - lib/financeiro.ts
  - components/oficina/financeiro
  - lib/pix.ts
---

# Financeiro da oficina

O dinheiro da oficina: o que entra, o que sai, o caixa do dia, o fiado e o Pix do balcão.

## O que faz
Registra contas a receber e a pagar, formas de pagamento e parcelas (maquininha, boleto,
fiado), mostra o caixa do dia, cobra o fiado por WhatsApp e gera o Pix do balcão.

## Lógica (lib)
- `lib/financeiro.ts` — funções puras (sem banco nem navegador): formas de pagamento, categorias de receber (serviço, peças, clube, outros) e de pagar, caixa, parcelas e fiado.
- `lib/pix.ts` — BR Code estático (`codigoPix`), com a chave Pix da própria oficina; o dinheiro vai direto, sem intermediário.

## Telas e rotas
- `components/oficina/financeiro` — telas do financeiro.
- `app/oficina/financeiro`.

## Banco
- Lançamentos no estado local sincronizado; vínculo com as ordens e os pagamentos do cliente.

## Regras e invariantes
- Soma sempre em centavos (evita erro de arredondamento) — `somaEmReais`.
- O débito cai no dia seguinte, mas conta como hoje para o caixa.
- O Revisaí não intermedia o dinheiro: Pix é código estático da oficina.

## Como estender
Esta é a base do ERP financeiro. Contas novas entram como lançamentos categorizados, para o
plano de contas e o DRE (ver `erp/contabilidade`) somarem em cima sem retrabalho.

## Segurança e LGPD
Chave Pix é dado da oficina; não expor em log. Ver `plataforma/seguranca-lgpd`.

## Depende de
`oficina/ordens`.

## A fazer
Plano de contas e DRE (`erp/contabilidade`), fluxo de caixa projetado (`erp/fluxo-caixa`) e a
conta a pagar nascendo da compra (`erp/compras-formais`).

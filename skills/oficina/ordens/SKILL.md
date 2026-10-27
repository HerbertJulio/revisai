---
nome: oficina/ordens
dominio: oficina
produto: Oficina Essencial
status: pronto
arquivos:
  - components/oficina/passo/PassoAPasso.tsx
  - lib/documentos.ts
  - lib/links-publicos.ts
  - lib/links-servidor.ts
  - app/(cliente)/l/[token]/page.tsx
---

# Ordem de serviço e orçamento

Montar a ordem/orçamento do carro e mandar um link bonito para o cliente ver e aprovar.

## O que faz
A oficina monta o documento do serviço (orçamento, andamento, checklist, garantia, histórico)
com peças e serviços, e gera um link para o cliente abrir no celular sem instalar nada.

## Telas e rotas
- `components/oficina/passo/PassoAPasso.tsx` — o passo a passo de montar a ordem.
- `app/oficina/ordens`, `app/oficina/ordem`, `app/oficina/registrar` — listar e registrar.
- `app/(cliente)/l/[token]/page.tsx` — a página do cliente (orçamento, andamento, checklist, garantia, histórico).

## Lógica (lib)
- `lib/documentos.ts` — o documento e seus totais (funções puras).
- `lib/links-publicos.ts` / `lib/links-servidor.ts` — publicar e abrir links; o banco guarda só o **hash** do token (`ver_link`, `responder_link`).

## Banco
- Documentos no estado local (sincronizado com conta). Links em `links_publicos` (por hash). Respostas do cliente por `responder_link`.

## Regras e invariantes
- O cliente abre o link sem conta; o token é secreto e guardado como hash.
- Publicar link precisa de conta; o documento em si funciona offline.

## Como estender
Tipo de documento novo entra em `lib/documentos.ts` e ganha uma visão na página do cliente.
Mantenha o token como hash.

## Segurança e LGPD
O link expõe dados do cliente a quem tem o token: token forte, sem enumeração. Ver `plataforma/seguranca-lgpd`.

## Depende de
`oficina/cadastros`, `oficina/financeiro` (pagamento), `plataforma/dados-rls`.

## A fazer
Encaixar o apontamento do mecânico (ver `oficina/mecanicos`).

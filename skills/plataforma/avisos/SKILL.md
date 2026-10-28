---
nome: plataforma/avisos
dominio: plataforma
produto: todos
status: pronto
arquivos:
  - lib/avisos/processar.ts
  - lib/avisos/whatsapp.ts
  - lib/avisos/email.ts
  - lib/avisos/push.ts
  - app/api/avisos/processar/route.ts
  - app/api/push/route.ts
  - app/api/cron/manter-ativo/route.ts
---

# Avisos e notificações

Mandar avisos para oficinas, lojas e clientes pelos canais certos, sem travar a tela.

## O que faz
Quando algo acontece (pedido novo, alerta respondido, pagamento informado, agendamento), o
sistema enfileira um aviso e manda pelo canal que a pessoa prefere: WhatsApp, e-mail ou push.

## Lógica (lib)
- `lib/avisos/processar.ts` — despachante: `avisos_reservar` → envia → `avisos_concluir`. Tipos em `lib/avisos/mensagens.ts`.
- `lib/avisos/email.ts` — Resend (`POST https://api.resend.com/emails`). Env `RESEND_API_KEY`, `AVISOS_REMETENTE`. Grátis até ~3 mil/mês.
- `lib/avisos/whatsapp.ts` — Meta Cloud API (`graph.facebook.com`) com modelo aprovado. Env `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_MODELO_*`. Grátis na janela de 24h.
- `lib/avisos/push.ts` — Web Push (pacote `web-push`); chaves VAPID geradas uma vez e guardadas no banco (`vapid_obter`/`vapid_guardar`). Grátis.

## Telas e rotas
- `app/api/avisos/processar/route.ts` — processa a fila (auth por cabeçalho `x-revisai-avisos`, conferido por `avisos_ping_confere`).
- `app/api/push/route.ts` e `app/api/push/chave|teste` — inscrição e teste de push.
- `app/api/avisos/preferencias/route.ts` — canais por pessoa (`avisos_preferencias`).

## Banco
- Fila de avisos; `avisos_reservar`, `avisos_concluir`, `avisos_preferencias`, `vapid_*`, `push_inscrever`/`push_cancelar`.
- O banco "acorda" a fila com **pg_net** (`net.http_post`) logo após enfileirar; o cron diário é a rede de segurança.

## Regras e invariantes
- Um aviso é reservado antes de enviar, para não mandar duplicado.
- Avisos de manutenção da oficina ao cliente usam link `wa.me` (manual, grátis), não a Cloud API — ver `oficina/avisos-manutencao`.

## Integrações e chaves
Resend (grátis), Meta WhatsApp Cloud (grátis em 24h), Web Push (grátis). WhatsApp e e-mail
só funcionam depois de configurados.

## Como estender
Tipo de aviso novo entra em `lib/avisos/mensagens.ts` com o texto por canal. O despachante
não muda.

## Segurança e LGPD
Não colocar dado pessoal além do necessário no corpo do aviso. Respeitar o canal escolhido.

## Depende de
`plataforma/dados-rls`.

## A fazer
Ligar Resend e WhatsApp Cloud (ver documento de integrações).

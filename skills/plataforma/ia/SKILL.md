---
nome: plataforma/ia
dominio: plataforma
produto: Oficina Pro (voz, agente)
status: pronto
arquivos:
  - lib/agente/ia.ts
  - lib/voz-servidor.ts
  - app/oficina/acoes-agente.ts
  - app/api/voz/[id]/route.ts
  - app/api/whatsapp/route.ts
---

# IA (voz, agente e transcrição)

A inteligência que transcreve áudio, monta ordem de serviço e lê o passo a passo.

## O que faz
O mecânico fala o serviço e a IA monta a ordem; manda áudio/foto pelo WhatsApp e a ordem
chega pronta no app; as perguntas do passo a passo podem ser lidas em voz.

## Lógica (lib)
- `lib/agente/ia.ts` — fala com o **Google Gemini** pelo `@ai-sdk/google` (env `GOOGLE_GENERATIVE_AI_API_KEY`, chave grátis do AI Studio) ou pelo **Vercel AI Gateway** (OIDC ou `AI_GATEWAY_API_KEY`). Modelos em `AGENTE_MODELO_GOOGLE`/`AGENTE_MODELO`.
- `lib/voz-servidor.ts` — TTS com Gemini (voz "Achird"); gera o áudio uma vez e guarda no Storage (bucket público `voz`). Sem chave, responde 204 e a tela lê o texto.
- `lib/agente/webhook.ts`, `lib/agente/whatsapp-cloud.ts` — o agente no WhatsApp: recebe mídia só de hosts da Meta, interpreta com IA, entrega a ordem no app.

## Telas e rotas
- `app/oficina/acoes-agente.ts` — `transcreverAudio`, `montarOrdemComIA`, pareamento do WhatsApp.
- `app/api/voz/[id]/route.ts` — serve o áudio da pergunta.
- `app/api/whatsapp/route.ts` — webhook do WhatsApp (verifica assinatura `x-hub-signature-256`).

## Banco
- Cota mensal da IA: `consumir_cota`/`devolver_cota` (recursos `montagem` e `transcricao`), erro `RV040` quando acaba. Uso lido por `uso_do_mes`.

## Regras e invariantes
- Cada uso confere a cota no banco (grátis: 5 ordens/mês; Pro: 300). Sem conta, a voz com IA fica fechada.
- A chave da IA fica só no servidor; o navegador nunca a vê.

## Integrações e chaves
Gemini (grátis na camada free) ou Vercel AI Gateway. WhatsApp Cloud para o agente.

## Como estender
Prompt e esquema da ordem em `lib/agente/prompt.ts` e `lib/agente/esquema.ts`. Trocar de
modelo é variável de ambiente, não código.

## Segurança e LGPD
Áudio e foto do cliente são dados pessoais: guardar o mínimo e pelo tempo necessário. Ver
`plataforma/seguranca-lgpd`.

## Depende de
`plataforma/dados-rls`, `plataforma/avisos` (para o agente responder).

## A fazer
—

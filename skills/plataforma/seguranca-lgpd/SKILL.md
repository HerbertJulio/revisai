---
nome: plataforma/seguranca-lgpd
dominio: plataforma
produto: todos
status: parcial
arquivos:
  - lib/supabase-servidor.ts
  - lib/limite.ts
  - lib/avisos/http.ts
  - lib/captcha.ts
  - app/admin/acoes.ts
---

# Segurança e LGPD

A régua de segurança que toda feature segue, e os direitos do titular dos dados.

## Lista de conferência (vale para todo módulo)
- **Acesso pelo banco (RLS), nunca só pela tela.** A tela guia; o banco decide. Ver `plataforma/dados-rls`.
- **Segredos só em variável de ambiente ou no GitHub secrets.** Nunca no código, nunca no bundle do navegador, nunca em `.env` commitado. Não existe senha de usuário (login sem senha).
- **Tudo que entra é validado** com Zod na borda (server actions e rotas).
- **Limites contra abuso:** `lib/limite.ts` (`permitido`/`permitidoPara`, contado no banco por `limite_consumir`). Rotas sensíveis têm teto por conta/IP.
- **Mesma origem** nos POST internos (`lib/avisos/http.ts` `mesmaOrigem`); **assinatura** nos webhooks (WhatsApp `x-hub-signature-256`, Asaas/Efí por token/segredo).
- **Tokens guardados como hash** (links do cliente, API da loja, chave do sistema): o banco nunca guarda o token em claro.
- **Cookies da equipe** httpOnly + sameSite strict; 2FA (TOTP) com validade de 12h.
- **Captcha** (Turnstile) disponível para login e formulários públicos.

## LGPD (o que já existe e o que respeitar)
- **Direitos do titular:** exportar e apagar dados existem no admin (`exportarDadosDoTitular`, `apagarDadosDoTitular`).
- **Registro de acesso (Marco Civil):** `registrar_acesso` 1x/hora.
- **Consentimento:** formulários públicos (agendamento) pedem aceite.
- **Minimização:** guardar só o dado necessário, pelo tempo necessário. Áudio/foto do agente e certificado fiscal A1 não ficam guardados além do preciso (o A1 vai direto à Focus).
- Dados sensíveis não entram em log nem em corpo de aviso.

## Onde entram as skills de segurança da internet
Skills de ataques, vulnerabilidades e normas (LGPD, OWASP) que você trouxer entram **nesta
pasta** como arquivos próprios (ex.: `owasp-top-10.md`, `lgpd-checklist.md`). Esta skill passa
a apontar para elas, e a lista de conferência acima cresce com os pontos que elas trouxerem.

## Como estender
Feature nova passa por esta lista antes de subir. Se tocar dado pessoal, diz aqui qual dado e
por quê.

## A fazer
Trazer as skills de segurança externas. Revisão de RLS tabela a tabela. Política de retenção
e expiração de mídia.

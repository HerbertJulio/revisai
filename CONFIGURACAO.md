# Configuração do Revisaí (serviços externos)

Guia dos pontos que você liga fora do código para o sistema funcionar inteiro. O código já está
pronto para todos eles; o que falta é cada chave no lugar certo.

**Onde colocar as chaves:** no painel da Vercel, em Settings → Environment Variables do projeto
`revisai` (produção). Nunca no código nem em arquivo commitado. Depois de mudar uma variável,
faça um novo deploy para ela valer.

Legenda: ✅ já configurado · ⬜ falta ligar · 🔸 opcional (o sistema funciona sem, com menos
recurso).

---

## 1. Supabase — login e banco (o mais importante)

É o que faz o login, o cadastro e a nuvem. Sem isso, nada entra.

Variáveis na Vercel:
- `SUPABASE_URL` ✅ — endereço do projeto.
- `SUPABASE_PUBLISHABLE_KEY` ✅ — chave pública do navegador.
- `SITE_URL` ⬜ — precisa ser `https://revisai.howlks.com` (os links de e-mail e o retorno do
  Google usam isso; se ficar em branco ou em localhost, o login por link e o Google quebram).
- `SISTEMA_CHAVE` e `EQUIPE_CHAVE` ✅ — segredos internos do servidor (acesso de sistema e da
  equipe). Mantenha secretos.
- `CRON_SECRET` ✅ — protege as rotas que rodam sozinhas (envio de avisos).

No painel do Supabase (https://supabase.com/dashboard/project/jlbpsgscspxpnvjhwwnq):
- **Authentication → URL Configuration** ⬜ — Site URL = `https://revisai.howlks.com`; em
  Redirect URLs adicione `https://revisai.howlks.com/auth/callback`,
  `https://revisai.howlks.com/auth/confirmar` e `https://revisai.howlks.com/auth/redefinir`.
- **Authentication → Providers → Email** ✅ — deixa ligado. A opção "Confirm email" decide se a
  conta nova precisa confirmar o e-mail antes de entrar. Em beta, para testar rápido, dá para
  desligar; em produção de verdade, deixe ligada e configure o SMTP abaixo.
- **Authentication → Providers → Google** ⬜ — ligue e cole Client ID e Client Secret (criados no
  Google Cloud, tela de OAuth, com a origem `https://revisai.howlks.com` e o redirect
  `https://jlbpsgscspxpnvjhwwnq.supabase.co/auth/v1/callback`). Enquanto estiver desligado, o
  botão "Entrar com Google" nem aparece.
- **Authentication → SMTP** 🔸 — o envio de e-mail embutido do Supabase é limitado e cai no spam.
  Para os códigos, confirmações e "esqueci a senha" chegarem de verdade, aponte para um SMTP seu
  (dá para usar o mesmo Resend do item 5). Enquanto não fizer isso, use contas com senha criadas
  no painel (demo e testes) para não depender de e-mail.
- **Authentication → Users → Add user** — é aqui que você cria as contas de demonstração
  (demo-oficina, demo-loja, demo-admin) com senha e "Auto Confirm User" ligado.

---

## 2. Google IA (Gemini) — voz, agente e transcrição 🔸

Faz a ordem por voz, o agente do WhatsApp e a leitura de áudio.

- `GOOGLE_GENERATIVE_AI_API_KEY` ⬜ — chave do Google AI Studio (https://aistudio.google.com).
- `AI_GATEWAY_API_KEY` 🔸 — alternativa, se for passar pelo gateway da Vercel.
- `VOZ_MODELO`, `AGENTE_MODELO`, `AGENTE_MODELO_GOOGLE`, `AGENTE_GOOGLE_URL` 🔸 — só se quiser
  trocar o modelo padrão.

Sem esta chave, o resto do sistema roda normal; só os recursos de IA ficam desligados.

---

## 3. WhatsApp (API Oficial da Meta) — avisos e agente ⬜

Manda os avisos de manutenção, os alertas da loja e, com a IA, atende o cliente. Precisa de uma
conta Meta Business com um número no WhatsApp Cloud API e modelos de mensagem aprovados.

- `WHATSAPP_TOKEN` ⬜ — token de acesso do app da Meta.
- `WHATSAPP_PHONE_NUMBER_ID` ⬜ — id do número (não é o número em si).
- `WHATSAPP_NUMERO` ⬜ — o número que aparece para o cliente.
- `WHATSAPP_VERIFY_TOKEN` ⬜ — uma senha que você inventa, usada para a Meta confirmar o webhook.
- `WHATSAPP_APP_SECRET` ⬜ — segredo do app, para validar que a mensagem veio mesmo da Meta.
- `WHATSAPP_API_VERSAO` 🔸 — versão da API (tem um padrão).
- Nomes dos modelos aprovados: `WHATSAPP_MODELO_AVISO`, `WHATSAPP_MODELO_IDIOMA`,
  `WHATSAPP_MODELO_LOJA_PEDIDO`, `WHATSAPP_MODELO_LOJA_PIX`, `WHATSAPP_MODELO_LOJA_ALERTA`,
  `WHATSAPP_MODELO_LOJA_DEVOLUCAO` ⬜ — cada mensagem automática usa um modelo que a Meta precisa
  aprovar antes.

Webhook a cadastrar na Meta: `https://revisai.howlks.com/api/whatsapp` (com o
`WHATSAPP_VERIFY_TOKEN` acima). Sem WhatsApp, o sistema cai para e-mail e push nos avisos.

---

## 4. Push (notificação no navegador/celular) ✅

- `VAPID_ASSUNTO` ⬜ — um e-mail de contato (ex.: `mailto:hvcotta@gmail.com`). As chaves em si o
  sistema gera sozinho e guarda no banco; não precisa criar à mão.

---

## 5. E-mail (Resend) — avisos por e-mail 🔸

- `RESEND_API_KEY` ⬜ — chave do Resend (https://resend.com).
- `AVISOS_REMETENTE` ⬜ — o remetente verificado (ex.: `Revisaí <avisos@revisai.howlks.com>`),
  o que exige validar o domínio no Resend.
- `AVISOS_RESEND_URL`, `AVISOS_WHATSAPP_URL` 🔸 — só para apontar para outro endpoint.

---

## 6. Placa do carro — grátis e o módulo pago 🔸

- **Grátis, já pronto:** só da placa o sistema tira o tipo (antiga/Mercosul) e o estado de
  emplacamento, sem chave nenhuma. É o que adianta o cadastro.
- **Despachante (pago):** `PLACA_API_PROVEDOR` e `PLACA_API_TOKEN` ⬜ — ligam a consulta completa
  (marca, modelo, ano, cor, chassi, FIPE e, conforme o provedor, roubo/furto e débitos). Provedor
  padrão `consultadeplaca`; para demonstrar sem gastar, use `PLACA_API_PROVEDOR=teste` (só fora de
  produção, devolve um carro de mentira). Cada consulta de verdade tem custo, por isso tem cota por
  mês por oficina. É o add-on que você vende por cima.

---

## 7. PIX — receber pagamento 🔸

- `REVISAI_PIX_CHAVE`, `REVISAI_PIX_NOME`, `REVISAI_PIX_CIDADE`, `REVISAI_PIX_TIPO` ⬜ — a chave
  PIX do recebedor e os dados que entram no QR Code de cobrança.

---

## 8. Nota fiscal (Focus NF-e) 🔸

- `FOCUS_NFE_TOKEN` ⬜ — token da Focus (https://focusnfe.com.br) para emitir NF-e e NFS-e. Sem
  ele, a parte fiscal fica desligada e o resto funciona.

---

## 9. Verificação de pessoa no login (Cloudflare Turnstile) 🔸

- `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` ⬜ — ligam o "não sou robô" no login, contra abuso.
  Enquanto estiverem em branco, o login funciona sem essa etapa.

---

## 10. Contato de suporte 🔸

- `NEXT_PUBLIC_SUPORTE_WHATSAPP` 🔸 — número que aparece nos botões de "falar com o suporte".

---

## Domínio e hospedagem

O site está na Vercel, no domínio `revisai.howlks.com`, e já funciona. A Hostinger só entra se o
DNS do `howlks.com` estiver lá: nesse caso, para um subdomínio novo, cria-se um registro CNAME
apontando para a Vercel. Para o `revisai.howlks.com` atual não há nada a mexer.

---

## Prioridade para o sistema "de pé" de verdade

1. `SITE_URL` e as Redirect URLs do Supabase (faz o login por link e o Google funcionarem).
2. Contas de demonstração com senha no painel do Supabase (testar e apresentar sem depender de
   e-mail).
3. SMTP no Supabase + Resend (os e-mails de confirmação e senha chegarem).
4. Google IA (voz e agente) e WhatsApp (avisos), que são o grande valor do dia a dia.
5. O resto (placa paga, PIX, nota fiscal, captcha) conforme for vendendo cada módulo.

---
nome: plataforma/auth-paineis
dominio: plataforma
produto: todos
status: pronto
arquivos:
  - app/entrar/page.tsx
  - components/conta/FormEntrar.tsx
  - components/conta/SeletorDePainel.tsx
  - app/admin/entrar/acoes.ts
  - lib/entrada.ts
  - lib/conta-dados.ts
  - lib/supabase-servidor.ts
  - lib/equipe/segundo-fator.ts
  - proxy.ts
---

# Autenticação e painéis

Entrar no sistema e cair no painel certo (oficina, loja ou equipe), sem senha.

## O que faz
A pessoa abre `/entrar`, escolhe o painel e entra com o Google ou com o e-mail (recebe um
código de 6 números). Sem senha para lembrar nem vazar. A equipe entra por `/admin` com uma
etapa a mais (app autenticador).

## Telas e rotas
- `app/entrar/page.tsx` — mostra o seletor de painel quando nenhum foi escolhido; senão, o formulário.
- `components/conta/SeletorDePainel.tsx` — escolha entre oficina, loja de peças e equipe.
- `components/conta/FormEntrar.tsx` — Google (`signInWithOAuth`) e e-mail (`signInWithOtp` + `verifyOtp` tipo `email`).
- `app/auth/confirmar` e `app/auth/callback` — fecham o login por link e por Google.
- `app/admin/entrar/acoes.ts` — login da equipe com 2FA.

## Lógica (lib)
- `lib/entrada.ts` — `provedoresDeEntrada()` lê de `/auth/v1/settings` quais entradas estão ligadas (o botão do Google só aparece se o Google estiver ligado no Supabase). `destinoSeguro()` só deixa voltar para rotas do próprio app.
- `lib/conta-dados.ts` — papéis: `PAPEIS_OFICINA` (dono, gerente, mecânico), `PAPEIS_LOJA` (dono, vendedor), `PAPEIS_EQUIPE` (admin, suporte, financeiro).
- `lib/supabase-servidor.ts` — `sessaoAtual()` lê o usuário dos cookies; traz `aal` (aal2 = passou pelo 2º fator) e os métodos usados.
- `lib/equipe/segundo-fator.ts` — TOTP (app autenticador) da equipe, via Supabase MFA, vale 12h.

## Banco
- Auth do Supabase (tabelas `auth.*`). Membros: `public.oficina_membros`, `public.fornecedor_membros`, `privado.equipe` (com `papel`).
- 2FA: fatores TOTP do Supabase; `privado.eh_equipe` exige aal2 recente.

## Regras e invariantes
- O acesso real é do banco (RLS), não da tela. A tela só guia.
- `/admin` só abre no host da equipe quando `EQUIPE_HOST` está setado, e pode ser travado por IP (`EQUIPE_IPS`); fora disso, 404.
- Oficina e loja compartilham o mesmo login; o destino (`?para=`) decide a área.

## Integrações e chaves
- Supabase Auth (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`).
- Google OAuth: ligar no painel do Supabase (grátis). Até ligar, só o e-mail aparece.
- Captcha opcional: Cloudflare Turnstile (`TURNSTILE_SITE_KEY`/`SECRET_KEY`).

## Como estender
Painel novo entra como mais uma opção no seletor e um `?para=` novo; o acesso vem de um papel
no banco com RLS. Nunca liberar área nova só escondendo/mostrando na tela.

## Segurança e LGPD
Login sem senha (menos superfície de ataque). Cookies da equipe são httpOnly e sameSite
strict. Não logar e-mail/código. Ver `plataforma/seguranca-lgpd`.

## Depende de
`plataforma/dados-rls`.

## A fazer
Ligar o Google no Supabase. Avaliar entitlements por conta (ver `ARQUITETURA.md`).

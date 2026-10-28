---
nome: plataforma/dados-rls
dominio: plataforma
produto: todos
status: pronto
arquivos:
  - lib/supabase-servidor.ts
  - lib/supabase.ts
  - lib/store.ts
  - lib/conta.ts
  - supabase/migrations
---

# Dados, acesso (RLS) e dados locais

Como o sistema fala com o banco, quem pode ver o quê, e como a oficina funciona offline.

## O que faz
Guarda os dados no Supabase com regras de acesso no próprio banco. A área da oficina roda
primeiro no aparelho (offline) e sincroniza quando há conta.

## Lógica (lib)
- `lib/supabase-servidor.ts` — três jeitos de o servidor falar com o banco:
  - `clienteDoUsuario()` — como a pessoa logada; o banco aplica as regras dela (RLS).
  - `clientePublico()` — sem conta, só o que é público (catálogo, links do cliente).
  - `clienteSistema()` — o próprio servidor, com a **chave do sistema** no cabeçalho `x-revisai-sistema` (env `SISTEMA_CHAVE`, hoje `EQUIPE_CHAVE`); o banco guarda só o SHA-256 em `privado.chaves`.
  - `provaDoIp()` — assina o IP (HMAC com o hash da chave) para o banco confiar no IP do cabeçalho (`x-revisai-ip` + `x-revisai-ip-prova`).
- `lib/store.ts` — estado local (Zustand + IndexedDB, chave `revisai:oficina`): clientes, carros, ordens, estoque, financeiro. Com conta, vira cópia sincronizada.
- `lib/conta.ts` — `acessoDaOficina()` / `acessoDaLoja()`: resolvem quem está logado e a conta ativa; ponto natural para conferir direitos/entitlements no futuro.

## Banco
- RLS em todas as tabelas; o `clienteSistema` tem só o necessário para rotinas e webhooks.
- Migrações em `supabase/migrations`, aplicadas em produção pelo push na `main` (integração GitHub do Supabase).

## Regras e invariantes
- **A regra de acesso é sempre do banco (RLS).** A tela nunca é a fronteira de segurança.
- `clienteSistema` é poderoso: usar só em rotina/cron/webhook, nunca para servir dado de uma pessoa a outra.
- Dado local e nuvem não podem divergir sem resolução (ver os campos `sinc`/`contaOficinaId` no store).

## Integrações e chaves
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SISTEMA_CHAVE` (ou `EQUIPE_CHAVE`).

## Como estender
Tabela nova nasce com RLS desde o primeiro migration. Função que roda sem usuário usa o
`clienteSistema` e é escrita para enxergar só o que precisa.

## Segurança e LGPD
Base de tudo. Ver `plataforma/seguranca-lgpd`. Registro de acesso (Marco Civil) 1x/hora via `registrar_acesso`.

## Depende de
—

## A fazer
Trocar `EQUIPE_CHAVE` por `SISTEMA_CHAVE` dedicada. Camada de direitos por conta.

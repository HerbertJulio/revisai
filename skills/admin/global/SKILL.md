---
nome: admin/global
dominio: admin
produto: interno (equipe Revisaí)
status: parcial
arquivos:
  - app/admin/acoes.ts
  - lib/equipe
  - lib/pro.ts
  - lib/cobranca/painel.ts
---

# Admin global

O painel interno da equipe Revisaí. Só o global (nosso); a loja não tem admin separado — o
sistema dela já cuida disso.

## O que faz
- **Moderação e antifraude:** fila de moderação, lojas em análise (confere CNPJ), antifraude, limite de compra. `lib/loja/moderacao.ts`, `lib/loja/reputacao.ts`.
- **Assinaturas e Pro:** criar código Pro, liberar alertas, dar Pro/estender teste, marcar fundador. `lib/pro.ts`.
- **Cobranças:** painel de cobrança das assinaturas. `lib/cobranca/painel.ts`.
- **Suporte:** responder chamados (gera aviso `suporte_resposta`).
- **LGPD:** titulares (exportar/apagar dados) e registros de acesso.
- **Relatórios internos:** cadastros, oficinas, fornecedores, uso, coortes, NPS, base de prazos.

## Telas e rotas
- `app/admin/*` (page por área). Todas as gravações passam por `app/admin/acoes.ts`, com histórico no banco.
- Entrada protegida: `/admin` com 2FA, travado por host/IP (ver `plataforma/auth-paineis`).

## Papéis
`admin`, `suporte`, `financeiro` (`lib/equipe/papeis.ts` `PODE`; `lib/equipe/sessao.ts` confere equipe + 2FA de 12h + papel).

## Regras e invariantes
- Toda ação da equipe fica no histórico (auditoria).
- Papel decide o que cada um da equipe pode fazer.

## O que falta (pedido do usuário)
- **Visualização e relatórios gerenciais (BI interno):** números do negócio num painel que se lê (oficinas ativas, uso da IA, faturamento da plataforma, inadimplência). Pode usar um tipo de painel/dashboard.
- **Marketing do sistema:** área para o material e os números que vendem o Revisaí.

## Segurança e LGPD
É o painel mais sensível: host/IP + 2FA, histórico de tudo, e os direitos do titular moram aqui. Ver `plataforma/seguranca-lgpd`.

## Depende de
`plataforma/auth-paineis`, `plataforma/dados-rls`, todos os módulos (lê o que eles geram).

## A fazer
Painel de números (BI interno) e a área de marketing.

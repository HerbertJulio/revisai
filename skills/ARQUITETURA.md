# Arquitetura modular do Revisaí

Como o sistema é separado em módulos, como esses módulos podem ser vendidos em partes, a
decisão de mobile x desktop e a visão de segurança. Esta é a régua para toda feature nova.

## Princípio: módulos com fronteira clara

Um módulo é um recurso que faz sentido sozinho (estoque, financeiro, anúncios). Cada módulo
tem três camadas, sempre nos mesmos lugares:

- **Telas e rotas:** `app/<area>/...` (ex.: `app/oficina/...`, `app/fornecedor/...`, `app/admin/...`).
- **Lógica pura e de servidor:** `lib/<modulo>...` (ex.: `lib/financeiro.ts`, `lib/loja/produtos.ts`). A lógica pura (contas, regras) fica sem banco nem navegador, para testar fácil.
- **Dados e regras:** tabelas e funções no Supabase (`supabase/migrations`), com RLS decidindo quem vê e muda o quê.

Regra de ouro: **um módulo não mexe no interior de outro.** Eles conversam por contratos —
tipos em `lib/tipos.ts`, funções exportadas da `lib/` do módulo e funções do banco (RPC).
Isso é o que deixa cada pedaço vendável e a IA capaz de dominar um módulo sem ler o resto.

Um banco só, compartilhado. Não quebramos o Supabase em vários; a separação é lógica (por
schema, tabela e RLS), não física. É o que mantém o dado único e os relatórios possíveis.

## Empacotamento

Cada **produto vendável** é um conjunto de módulos. Proposta de pacotes:

- **Oficina Essencial** — cadastros, ordens, avisos de manutenção, agenda, financeiro básico.
- **Oficina Pro** — tudo do Essencial + estoque, compras, clube, ordem por voz, relatórios.
- **Oficina ERP** — tudo do Pro + compras formais, custo/estoque valorizado, contabilidade, fluxo de caixa, BI, fiscal, mecânicos (PCM/PCP).
- **Loja** — catálogo, pedidos, entregas, anúncios, financeiro da loja, API, equipe.
- **Avulsos (add-on)** — automações de dados (placa, etc.), nota fiscal, agente no WhatsApp.

Mecânica para ligar/desligar módulo por conta (a construir): hoje a oficina tem
`plano` (`gratis`/`teste`/`pro`) e a loja tem contrato. Evoluir para **direitos
(entitlements)**: uma lista de módulos liberados por conta, derivada do pacote + add-ons
contratados, conferida no servidor (no `acessoDaOficina`/`acessoDaLoja`) e refletida na
navegação. Um módulo bloqueado some do menu e a rota dele responde "não contratado". Assim
o cliente não carrega recurso que não quer e dá para montar preço para cada situação.

## Mobile e desktop

Recomendação: **um código só, responsivo e adaptativo — não dois sistemas.** Manter dois
repositórios (um mobile, um desktop) dobra bug, dobra teste e os dois sempre andam
desencontrados. O caminho limpo é o mesmo núcleo de lógica e de dados, com **camadas de
layout por tamanho de tela**: no celular, navegação de baixo e uma coluna; no desktop, menu
lateral e várias colunas, aproveitando o espaço. O Revisaí já é mobile-first e offline;
falta caprichar no layout desktop (listas densas, atalhos de teclado, mais de um painel na
tela). É o melhor dos dois mundos sem "código cagado". Se mesmo assim você quiser duas
experiências bem distintas, dá para ter dois _shells_ de layout no mesmo projeto, nunca dois
projetos. **Decisão sua.**

## Segurança e LGPD

Tratada como módulo próprio em [`plataforma/seguranca-lgpd`](./plataforma/seguranca-lgpd/SKILL.md),
com uma lista de conferência que vale para toda feature: acesso pelo banco (RLS) e nunca só
pela tela, segredos só em variáveis de ambiente, tudo que entra validado (Zod), limites
contra abuso, tokens guardados como hash, e os direitos do titular (exportar e apagar
dados), que já existem no admin. Quando você trouxer skills de segurança da internet
(ataques, vulnerabilidades, normas), elas entram nessa pasta e a lista cresce.

## Ordem de construção (as lacunas de ERP)

1. `erp/compras-formais` — fecha o ciclo compra → estoque → conta a pagar.
2. `erp/custo-estoque` — custo médio e estoque valorizado.
3. `erp/contabilidade` — plano de contas, centro de custo, DRE.
4. `erp/fluxo-caixa` — projeção pelos vencimentos.
5. `erp/bi` — painéis gerenciais.
6. `erp/multiempresa` — várias unidades.

O sistema dos mecânicos (`oficina/mecanicos`) entra entre o 1 e o 3.

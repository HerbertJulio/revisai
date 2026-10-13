# Revisaí

**Seu cliente esquece a troca de óleo. A oficina avisa antes.**

O Revisaí é um app web para oficinas mecânicas. Cada serviço registrado (troca de óleo, filtros, freios, pneus, correias, revisão) ganha um vencimento pela data **e** pela quilometragem, o que vier primeiro. Quando um carro chega perto, a oficina vê assim que abre o app e manda a mensagem pronta no WhatsApp com um toque. Junto de cada aviso, a loja sugere o produto certo para aquele carro (viscosidade, API e norma da montadora do manual) com as promoções dos fornecedores.

*Read in English: [README.md](README.md)*

## O que faz

- **Avisos pela data ou pela quilometragem.** A rodagem de cada carro sai do histórico do odômetro (ou do que o cliente informou), para prever quando ele chega ao km da troca.
- **Resumo do dia ao abrir o app**: quantos clientes avisar, quem está atrasado, quem está agendado para hoje. Notificação do navegador e número no ícone, se a oficina quiser.
- **WhatsApp com um toque**, com a mensagem editável, e as etapas *avisado → agendado → serviço feito*. Quem não respondeu volta para a lista depois de uma semana.
- **Prazos sugeridos** por uma base de conhecimento de manutenção (uso normal e severo), pelo prazo do manual do carro e pelo produto usado (óleo mineral encurta; vela de irídio dura mais). Tudo pode ser editado.
- **Recomendação de óleo que respeita o manual**: mesma viscosidade, API igual ou mais nova, a norma da montadora quando o manual pede (dexos1 Gen 3, VW 508 88, Fiat 9.55535-GS1, RN17…) e nunca rebaixa de sintético para mineral.
- **Loja (marketplace)**: catálogo, promoções com quantidade mínima e validade, a soma do que os clientes da oficina vão precisar nos próximos 30 dias, carrinho e pedido. Preços e total são recalculados pelo banco.
- **Etiqueta do para-brisa** em tamanho real (70 × 50 mm) e **cartão de manutenção** para o cliente, com lembretes no calendário (.ics). Os dados do cartão vão no fragmento do link e não passam pelo servidor.
- **Cadastro de interessados**: oficinas (plano Plus), fornecedores e donos de carro.
- Funciona no celular e no computador, tema claro e escuro, pode ser instalado (manifesto PWA).

## Como o vencimento é calculado

```
vence pela data = data do serviço + prazo em meses
vence pelo km   = km do serviço + prazo em km
data pelo km    = última leitura do odômetro + (km que faltam ÷ km por dia)
vencimento      = o que vier primeiro
```

A oficina é avisada quando o vencimento entra na antecedência escolhida (15 dias, por padrão) ou quando faltam menos km do que a margem escolhida (500 km, por padrão). A regra está em `lib/agenda.ts` e `lib/avisos.ts`, com testes.

## Tecnologia

- [Next.js 16](https://nextjs.org) (App Router) e React 19, TypeScript
- Tailwind CSS 4, fonte variável Archivo (SIL OFL)
- Zustand com IndexedDB para os dados da oficina (sem login nesta versão)
- [Supabase](https://supabase.com) (Postgres com RLS) para o catálogo da loja, os pedidos e os interessados
- Vitest para as regras de negócio
- Vercel para hospedar, com uma rotina diária que mantém o projeto grátis do Supabase acordado

## Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 22 ou mais novo.

```bash
git clone https://github.com/HerbertJulio/revisai.git
cd revisai
npm install
npm run dev
```

Abra http://localhost:3000. Sem variáveis de ambiente, a loja usa o catálogo de exemplo e os pedidos ficam desligados. Para ligar o banco, crie um `.env.local` (veja o `.env.example`):

```
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Outros comandos:

```bash
npm test          # regras de negócio (Vitest)
npm run typecheck # TypeScript
npm run build     # build de produção
npm run seed      # gera de novo o supabase/seed.sql a partir de lib/catalogo-demo.ts
```

## Banco de dados

`supabase/migrations/` cria as tabelas `fornecedores`, `produtos`, `promocoes`, `pedidos` e `interessados`, com RLS:

- qualquer pessoa lê o catálogo ativo;
- pedidos e interessados só recebem inserções (ninguém lê pela API);
- um gatilho confere cada produto do pedido e recalcula preço, promoção e total, então o navegador nunca manda preço;
- tabelas novas não ficam abertas para a API.

Rode a migração e depois o `supabase/seed.sql` no SQL Editor do Supabase (ou pela CLI). Os pedidos e os interessados ficam no painel do Supabase.

O navegador nunca fala direto com o Supabase: o catálogo vem de `/api/catalogo` (guardado pela CDN por 5 minutos) e os pedidos e cadastros passam por ações do servidor (`app/acoes.ts`).

## Publicar

O repositório está ligado à Vercel: cada push na `main` publica e cada pull request ganha um endereço de prévia. Variáveis de ambiente:

| Variável | Para quê |
| --- | --- |
| `SUPABASE_URL` | Endereço do projeto no Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável (anon), usada só no servidor |
| `CRON_SECRET` | Protege `/api/cron/manter-ativo`, a chamada diária que mantém o banco grátis acordado |

Diagnóstico: `/api/saude` mostra se o banco está configurado e respondendo.

## Como o código está organizado

```
app/                 páginas (App Router)
  (site)/            páginas públicas: início, fornecedores, planos, quem tem carro, cartão, privacidade
  oficina/           o app da oficina: avisos, clientes, carro, registrar serviço, loja, ajustes, etiqueta
  api/               catálogo, diagnóstico e rotina diária
  acoes.ts           ações do servidor: pedidos e interessados
components/          interface (app da oficina, site público, peças comuns)
lib/                 regras sem interface
  manutencao.ts      base de conhecimento: serviços, prazos, uso severo
  oleos.ts           SAE/API/ILSAC/ACEA, normas de montadora, compatibilidade, referências por motor
  agenda.ts          rodagem e vencimentos
  avisos.ts          lista de avisos, etapas e resumo do dia
  recomendacao.ts    recomendação de produtos e demanda dos 30 dias
  store.ts           dados da oficina no aparelho (Zustand + IndexedDB)
supabase/            migração e seed
tests/               Vitest
```

## Privacidade

Não tem conta nesta versão. Os clientes e serviços da oficina ficam no navegador do aparelho que usa o app (com backup e restauração em Ajustes). O servidor só recebe os pedidos da loja e os formulários de interesse, com consentimento.

## Próximos passos

- Login com Google ou e-mail (Supabase Auth). Quem ainda não é cliente ganha o teste grátis ou o plano Plus; os dados do aparelho sobem para a nuvem no primeiro acesso.
- Lembrete automático para o dono do carro (WhatsApp e e-mail) nas oficinas Plus.
- Portal do fornecedor para cuidar de produtos, promoções e pedidos.

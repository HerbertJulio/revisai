# Revisaí

**Seu cliente esquece a troca de óleo. A oficina avisa antes.**

O Revisaí é um app web para oficinas mecânicas, com uma loja de peças para as lojas da região e uma área para a equipe. Cada serviço registrado (troca de óleo, filtros, freios, pneus, correias, revisão) ganha um vencimento pela data **e** pela quilometragem, o que vier primeiro. Quando um carro chega perto, a oficina vê assim que abre o app e manda a mensagem pronta no WhatsApp com um toque. Do orçamento à garantia, do caixa do dia à compra das peças, tudo fica num lugar só.

*Read in English: [README.md](README.md)*

## O que faz

**Para a oficina** (`/oficina`)

- **Avisos pela data ou pela quilometragem**, com o resumo do dia ao abrir o app, o WhatsApp com um toque e as etapas *avisado → agendado → serviço feito*.
- **Orçamento e ordem de serviço no passo a passo**, no toque ou na voz. O cliente recebe um link, vê o orçamento, desmarca o que não quer fazer agora e aprova; a aprovação guarda data, hora, aparelho e o que foi mostrado, e vale como prova. Os itens recusados viram lembretes para oferecer depois.
- **Andamento do serviço** para o cliente acompanhar pelo link, **checklist de entrada** com fotos, avarias marcadas no desenho do carro e assinatura no celular, **garantia digital** consultável pela placa e pelo código do certificado e **histórico verificado** do carro para a hora da venda.
- **Ordem de serviço por voz** e **agente no WhatsApp**: o mecânico fala ou manda áudios e fotos, e a ordem chega preenchida para conferir.
- **Agenda** do dia e da semana com os mecânicos, horários livres e confirmação pelo WhatsApp; **agendamento online** por um link que a oficina divulga; **kit da revisão**, com as peças dos carros agendados no carrinho da loja.
- **Financeiro**: contas a pagar e a receber, caixa do dia, parcelas, fiado com lembrete e Pix no balcão. **Relatórios** de faturamento, ticket médio, carros por mês, margem das peças e aprovação de orçamentos, **comissão por mecânico** e o **comparativo** com a média das oficinas da cidade.
- **Cobrança do cliente** pelo WhatsApp com a página do Pix no valor certo, **clube de manutenção** com mensalidade e **nota fiscal** do serviço (NFS-e) e das peças (NF-e) por um provedor de notas.
- **Cadastro do carro pela placa** com o valor FIPE, **entrada de estoque pelo XML da nota** e pelo código de barras, **fidelidade** com pontos em cada serviço, **recall** das montadoras virando lembrete para os carros que se encaixam e **pesquisa de satisfação**.
- **Estoque** com a previsão dos próximos 30 dias, **preço pago e comparação** com as outras lojas e **alerta de preço** para as lojas responderem.
- **Loja**: catálogo das lojas da região com fotos, prazo de entrega, pedido mínimo, estoque, compatibilidade com o carro do orçamento, preço combinado com cada oficina, cashback, venda faturada, Pix direto para a loja, entrega no mapa, devolução e garantia das peças.
- **Equipe da oficina**: dono, gerente e mecânico, cada um com a própria conta. O mecânico não vê valores.
- **Funciona sem internet**: os dados ficam no aparelho e sincronizam com o servidor quando há conta, em todos os aparelhos da oficina, em tempo real.
- **Planos**: o grátis tem 20 avisos e 5 ordens por voz por mês. O Pro libera o resto, com teste de 30 dias, e é cobrado por Pix Automático, cartão ou boleto, com a nota fiscal de cada mensalidade.

**Para as lojas** (`/fornecedor`)

- Conta do dono e dos vendedores, produtos com foto e ficha técnica, catálogo por aplicação (marca, modelo e ano), estoque, prazo de entrega e importação por planilha ou pela API de estoque e preço.
- Pedidos com a situação e o histórico, alertas de preço das oficinas do estado, preço especial por oficina, pedido mínimo, cashback, venda faturada para as oficinas em que a loja confia, devoluções e garantia.
- Chave Pix protegida (a troca só vale depois de 24 horas, com aviso), extrato mensal, anúncios pagos por clique, plano Destaque com cobrança mensal e a reputação da loja.

**Para a equipe** (`/admin`, com o código do e-mail e o app autenticador)

- Métricas de assinatura e coortes, painel do marketplace, uso por oficina, funil e antifraude, verificação do CNPJ das lojas, moderação de produtos e lojas, limite de compra para oficinas novas, caixa de suporte, pesquisa de satisfação, códigos do Pro, cobranças, base de prazos, registro de acessos e a exportação ou exclusão dos dados de uma pessoa (LGPD).

## Como o vencimento é calculado

```
vence pela data = data do serviço + prazo em meses
vence pelo km   = km do serviço + prazo em km
data pelo km    = última leitura do odômetro + (km que faltam ÷ km por dia)
vencimento      = o que vier primeiro
```

A oficina é avisada quando o vencimento entra na antecedência escolhida (15 dias, por padrão) ou quando faltam menos km do que a margem escolhida (500 km, por padrão). A regra está em `lib/agenda.ts` e `lib/avisos.ts`, com testes.

## Tecnologia

- [Next.js 16](https://nextjs.org) (App Router, ações do servidor) e React 19, TypeScript, Tailwind CSS 4
- Zustand com IndexedDB para os dados da oficina no aparelho, sincronizados com o Supabase (uma linha por item, com marca d'água da transação e tempo real)
- [Supabase](https://supabase.com): Postgres com RLS em todas as tabelas, Auth (código por e-mail, Google e app autenticador para a equipe), Storage e Realtime
- [AI SDK](https://ai-sdk.dev) com o Gemini para as ordens por voz
- Avisos por uma fila no banco: e-mail (Resend), WhatsApp (modelos da Meta) e notificação no celular (Web Push)
- Pix com o BR Code montado no próprio app; cobrança do Pro pelo Asaas ou pela Efí (Pix Automático); notas das oficinas pela Focus NFe
- Vitest para as regras de negócio e para as permissões do banco; Playwright para os testes no navegador
- Vercel para hospedar, com uma rotina diária (`/api/cron/manter-ativo`)

## Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 22 ou mais novo.

```bash
git clone https://github.com/HerbertJulio/revisai.git
cd revisai
npm install
npm run dev
```

Abra http://localhost:3000. Sem variáveis de ambiente, o app da oficina funciona no modo sem conta (os dados ficam só no aparelho) e a loja usa o catálogo de exemplo.

Para ter o banco, o login e a API no computador, sem Docker:

```bash
npm run banco:local -- start   # Postgres 17, login (GoTrue), API (PostgREST) e um gateway em http://127.0.0.1:54321
cp .env.example .env.local     # e use os valores locais indicados no arquivo
npm run dev
```

Os e-mails com o código de login ficam em http://127.0.0.1:54321/__mail.

Outros comandos:

```bash
npm test             # regras de negócio (Vitest)
npm run test:banco   # permissões, gatilhos e funções no banco local
npm run typecheck    # TypeScript
npm run build        # build de produção
```

## Banco de dados

`supabase/migrations/` cria tudo: contas e papéis (`oficina_membros`, `fornecedor_membros`, `privado.equipe`), os dados da oficina (`registros`, um por item, com a numeração única de orçamentos e ordens), a loja, os pedidos, as cobranças, os links dos clientes, a fila de avisos e o registro de acessos. As regras principais:

- RLS em todas as tabelas, por oficina, por loja e por papel; o mecânico não recebe as coleções com valores;
- as funções que mudam dados conferem quem chama, e as tabelas novas não ficam abertas para a API;
- preço, total, comissão, cashback e cota são calculados pelo banco, nunca pelo navegador;
- os links dos clientes e do entregador ficam guardados só como hash; as chaves de API das lojas também;
- as lojas recebem os alertas de preço sem saber qual oficina pediu, e o catálogo das lojas sai só pelo servidor (sem conta, a API não entrega nada das lojas);
- o servidor usa uma chave do sistema só nas rotinas, nos webhooks e para montar o catálogo (o banco guarda o hash dela em `privado.chaves`).

## Publicar

O repositório está ligado à Vercel: cada push na `main` publica, e a publicação roda os testes antes do build (se um teste falha, nada vai para o ar). O GitHub roda os tipos, os testes, os testes do banco e o build a cada mudança, faz o backup semanal do banco e confere a saúde do site.

As variáveis de ambiente estão todas em [`.env.example`](.env.example), com o que cada uma liga. Diagnóstico: `/api/saude` e a página `/status`.

### Ligar o agente no WhatsApp

1. Em [developers.facebook.com](https://developers.facebook.com), crie um app do tipo Empresa e adicione o produto WhatsApp. A Meta dá um número de teste; para o número de verdade, cadastre um número que ainda não esteja no aplicativo do WhatsApp.
2. Crie um usuário do sistema no Gerenciador de Negócios, gere um token permanente com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` e preencha as variáveis `WHATSAPP_*` na Vercel.
3. Em WhatsApp, Configuração, cadastre o webhook `https://revisai.howlks.com/api/whatsapp` com o mesmo `WHATSAPP_VERIFY_TOKEN` e assine o campo `messages`.
4. No app da oficina, em Ajustes, Agente no WhatsApp, toque em Ligar o WhatsApp do mecânico e mande o código para o número do agente.

## Como o código está organizado

```
app/                 páginas (App Router)
  (site)/            páginas públicas: início, planos, lojas, comparativo, status e documentos legais
  (cliente)/         páginas que o cliente da oficina abre: link do orçamento e do andamento, agendamento, garantia e entrega
  entrar/, conta/    login e conta (oficina ou loja)
  oficina/           o app da oficina
  fornecedor/        o painel da loja
  admin/             a área da equipe
  api/               catálogo, avisos, pagamentos, WhatsApp, voz, saúde e a rotina diária
components/          interface (oficina, loja, equipe, site, cliente e peças comuns)
lib/                 regras sem interface (vencimentos, documentos, estoque, financeiro, agenda, cobrança, avisos, loja...)
supabase/            migrações e seed
scripts/             banco local e seed
tests/               Vitest (tests/banco: permissões no Postgres)
```

## Privacidade

Cada oficina vê só os próprios dados, e cada loja só os próprios pedidos e produtos. Os dados da oficina ficam no aparelho e, com a conta, no servidor, separados por oficina. O cliente da oficina vê só o que a oficina mandou pelo link, e o link para de valer quando a oficina revoga ou quando vence. Os áudios e fotos das ordens por voz vão para a IA só para preencher a ordem. A posição do entregador é apagada quando a entrega termina. O Revisaí não guarda o certificado digital da oficina nem a senha dele. Os prazos de guarda e exclusão estão na [política de privacidade](https://revisai.howlks.com/privacidade).

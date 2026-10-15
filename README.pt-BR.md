# Revisaí

**Seu cliente esquece a troca de óleo. A oficina avisa antes.**

O Revisaí é um app web para oficinas mecânicas. Cada serviço registrado (troca de óleo, filtros, freios, pneus, correias, revisão) ganha um vencimento pela data **e** pela quilometragem, o que vier primeiro. Quando um carro chega perto, a oficina vê assim que abre o app e manda a mensagem pronta no WhatsApp com um toque. Junto de cada aviso, a loja sugere o produto certo para aquele carro (viscosidade, API e norma da montadora do manual) com as promoções dos fornecedores.

*Read in English: [README.md](README.md)*

## O que faz

**Para a oficina** (`/oficina`)

- **Avisos pela data ou pela quilometragem.** A rodagem de cada carro sai do histórico do odômetro (ou do que o cliente informou), para prever quando ele chega ao km da troca.
- **Resumo do dia ao abrir o app**: quantos clientes avisar, quem está atrasado, quem está agendado para hoje. Notificação do navegador e número no ícone, se a oficina quiser.
- **WhatsApp com um toque**, com a mensagem editável, e as etapas *avisado → agendado → serviço feito*. Quem não respondeu volta para a lista depois de uma semana.
- **Orçamento e ordem de serviço no passo a passo.** Um caminho só para os dois, no toque ou na voz: o app pergunta em voz alta (qual é o carro, a placa, a quilometragem, quem é o dono, o que foi feito) e entende as respostas, depois mostra as peças para escolher com foto, como numa loja (“qual óleo foi usado?”). O orçamento pode ser frio, sem custo, ou pago, com a vistoria abatida se o cliente aprovar. O cliente abre o link do orçamento, desmarca o que não quer fazer agora e aprova pelo WhatsApp da oficina; o orçamento aprovado vira uma ordem de serviço já descrita. Ao concluir a ordem, o serviço fica registrado (é dele que saem os avisos) e as peças saem do estoque.
- **Estoque**: o que a oficina tem, quantidade mínima, entradas, saídas e contagens, e a previsão dos próximos 30 dias (o que os carros dos clientes e as ordens abertas vão usar, menos o que tem na prateleira). Quando algo vai faltar, o resumo do dia avisa: “você tem 25 L e vai precisar de mais 5 L”, com a loja que está com promoção.
- **Preço pago e comparação de preço**: em cada produto, quanto a oficina pagou da última vez e quanto as outras lojas cobram agora (o óleo comparado pelo litro), inclusive “subiu em todas as lojas”.
- **Alerta de preço (Pro)**: a oficina diz quanto quer pagar por um produto e as lojas do estado dela respondem em até 48 horas: aceitam, fazem uma contraproposta (outro preço ou uma quantidade mínima, “vendo por 24, mas levando 10”) ou dizem que não dá. A oficina escolhe e o pedido sai com o preço e a quantidade combinados, que o banco confere (se a loja mudar a proposta no meio do caminho, a oficina confirma a nova). São 10 alertas por mês no Pro e pacotes extras quando acabam; alerta sem resposta não conta.
- **Pedido acompanhado, Pix e entrega**: a parte de cada loja com a situação, o QR Code do Pix (e o copia e cola) com o valor certo assim que a loja confirma o pedido, pago direto para a loja, e o entregador no mapa enquanto o pedido está a caminho. O app avisa quando uma loja responde o alerta, confirma o pagamento ou manda o pedido.
- **Ordem de serviço por voz.** O mecânico toca no microfone e conta o serviço. O áudio fica guardado no aparelho e vira texto, e a IA preenche a ordem com esse texto (placa, km, serviços, diagnóstico, recomendações) e um texto caprichado para o cliente. O mecânico confere os campos, pode falar mais ou corrigir o texto, e confirma. Áudio, texto e fotos ficam no aparelho.
- **Agente no WhatsApp.** O mecânico manda áudios e fotos para o número do Revisaí, escreve *fechar* e a ordem chega pronta no app para conferir.
- **Saúde do carro**: o carro visto de cima, com a vida restante de cada item e as recomendações das ordens.
- **Prazos sugeridos** por uma base de manutenção (uso normal e severo), pelo manual do carro, pela base de prazos por produto (o que o fabricante indica) e pelos produtos da própria oficina. Tudo pode ser editado.
- **Recomendação de óleo que respeita o manual**: mesma viscosidade, API igual ou mais nova, a norma da montadora quando o manual pede (dexos1 Gen 3, VW 508 88, Fiat 9.55535-GS1, RN17…) e nunca rebaixa de sintético para mineral.
- **Loja (marketplace)**: catálogo com fotos, promoções com quantidade mínima e validade, lojas Destaque e produtos Patrocinados, a soma do que os clientes vão precisar nos próximos 30 dias, carrinho e pedido. Preços e total são recalculados pelo banco.
- **Etiqueta do para-brisa** em tamanho real (70 × 50 mm) e **cartão de manutenção** para o cliente: cada item abre o lembrete no Google Agenda ou no calendário do celular e o atalho para agendar pelo WhatsApp. Os dados do cartão vão no fragmento do link e não passam pelo servidor.
- **Planos.** O grátis tem 20 avisos e 5 ordens por voz por mês. O Pro libera avisos e ordens sem limite, o agente no WhatsApp, o relatório de retorno dos avisos, o pedido de avaliação no Google e o alerta de preço; tem teste de 30 dias no aparelho e é ativado com um código que a equipe gera depois do pagamento.

**Para os fornecedores** (`/fornecedor`, com link de acesso)

- Produtos com foto, ficha técnica e prazo de troca; promoções; pedidos da loja (só a parte de cada fornecedor).
- **Alertas de preço** das oficinas do mesmo estado, nas categorias que a loja vende: aceitar, fazer contraproposta ou recusar. O nome e o WhatsApp da oficina só chegam junto com o pedido, se ela escolher aquela loja.
- **Pix e entrega**: a loja cadastra a chave Pix e confirma o pedido; aí a oficina vê o Pix, paga pelo app e a loja confirma o pagamento. “Saiu para entrega” gera um link para o entregador; com ele aberto no celular, a oficina acompanha a entrega no mapa. O link para de valer quando o pedido é entregue.
- **Demanda da região**: a soma do que as oficinas que compartilham a previsão vão comprar, só com totais e só quando há pelo menos 3 oficinas, para ninguém ser identificado. Sugestões de promoção prontas.
- **Planos**: Vitrine (sem mensalidade, 6% de comissão) e Destaque (R$ 149 por mês, 4% de comissão, a loja aparece antes das outras). **Impulsos** de 7, 15 ou 30 dias colocam um produto em primeiro, com o selo Patrocinado.

**Para a equipe** (`/admin`, com senha)

- Resumo do mês, pedidos, cadastros do site, fornecedores (plano, comissão, link de acesso), promoções, impulsos, base de prazos (aprovar sugestões das oficinas), códigos do Pro com o uso dos alertas de cada um, e os pacotes de alertas extras para liberar depois do pagamento.

## Como o vencimento é calculado

```
vence pela data = data do serviço + prazo em meses
vence pelo km   = km do serviço + prazo em km
data pelo km    = última leitura do odômetro + (km que faltam ÷ km por dia)
vencimento      = o que vier primeiro
```

A oficina é avisada quando o vencimento entra na antecedência escolhida (15 dias, por padrão) ou quando faltam menos km do que a margem escolhida (500 km, por padrão). A regra está em `lib/agenda.ts` e `lib/avisos.ts`, com testes.

## Tecnologia

Tudo com camada grátis:

- [Next.js 16](https://nextjs.org) (App Router) e React 19, TypeScript
- Tailwind CSS 4, fonte variável Archivo (SIL OFL)
- Zustand com IndexedDB para os dados da oficina (sem login nesta versão)
- [Supabase](https://supabase.com) (Postgres com RLS e Storage) para a loja, os pedidos, os painéis e os rascunhos do agente
- [AI SDK](https://ai-sdk.dev) com o Vercel AI Gateway (crédito grátis todo mês) ou uma chave grátis do Google AI Studio (Gemini), para as ordens por voz, em dois passos: o áudio vira texto e o texto preenche a ordem
- O reconhecimento de fala do navegador no passo a passo, e a voz do Gemini (camada grátis) nas perguntas, gravada uma vez por frase e guardada no Storage
- Pix com o BR Code (o QR estático do Banco Central) montado no próprio app, e o OpenStreetMap no mapa da entrega
- WhatsApp Cloud API da Meta para o agente (as conversas que o mecânico começa são grátis)
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

Abra http://localhost:3000. Sem variáveis de ambiente, a loja usa o catálogo de exemplo e os pedidos, os painéis e a IA ficam desligados. Para ligar o banco, crie um `.env.local` a partir do `.env.example`.

Outros comandos:

```bash
npm test          # regras de negócio (Vitest)
npm run typecheck # TypeScript
npm run build     # build de produção
npm run seed      # gera de novo o supabase/seed.sql a partir de lib/catalogo-demo.ts
```

## Banco de dados

`supabase/migrations/` cria as tabelas da loja (`fornecedores`, `produtos`, `promocoes`, `impulsos`), dos pedidos, dos cadastros, da base de prazos (`produtos_referencia`), da demanda regional, das assinaturas do Pro e do agente no WhatsApp, além dos buckets do Storage (`produtos`, público, e `oficinas`, privado). Todas com RLS:

- qualquer pessoa lê só o catálogo ativo e a base de prazos aprovada;
- pedidos e cadastros só recebem inserções; um gatilho confere cada produto do pedido e recalcula preço, promoção e total, então o navegador nunca manda preço;
- o painel da equipe e o servidor mandam uma chave no cabeçalho `x-revisai-equipe`; o banco guarda só o hash dela (`privado.chaves`) e as políticas liberam o resto apenas com essa chave;
- os alertas de preço (`alertas_preco`, `alertas_respostas`, `alertas_creditos`) e as chaves Pix das lojas (`fornecedores_pix`) só abrem com essa chave; o gatilho do pedido aceita o preço combinado só para o aparelho que mandou o alerta, no produto daquela loja, entre a quantidade mínima e a negociada, no preço que a oficina viu e uma vez só, e fecha o alerta na mesma transação; outro gatilho limita quantos alertas uma oficina manda; toda troca de chave Pix fica guardada em `fornecedores_pix_historico`;
- o link do entregador fica guardado como hash SHA-256 e para de valer quando a entrega termina (ou depois de 3 dias); a posição do entregador é apagada no fim (e uma rotina diária limpa qualquer entrega com mais de 3 dias);
- tabelas novas não ficam abertas para a API.

O navegador nunca fala direto com o Supabase: o catálogo vem de `/api/catalogo` (guardado pela CDN por 5 minutos) e o resto passa por ações do servidor.

## Publicar

O repositório está ligado à Vercel: cada push na `main` publica e cada pull request ganha um endereço de prévia. Variáveis de ambiente:

| Variável | Para quê |
| --- | --- |
| `SUPABASE_URL` | Endereço do projeto no Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável (anon), usada só no servidor |
| `CRON_SECRET` | Protege `/api/cron/manter-ativo`, a chamada diária que mantém o banco grátis acordado |
| `EQUIPE_SENHA` | Senha do painel administrativo, em `/admin` |
| `EQUIPE_CHAVE` | Chave aleatória (64 caracteres hexadecimais, `openssl rand -hex 32`) que o servidor manda ao Supabase; o banco guarda só o hash SHA-256 dela em `privado.chaves`, com o nome `equipe`. Também assina a sessão dos fornecedores |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Opcional. Chave grátis do Google AI Studio; com ela, as ordens por voz usam o Gemini direto. Sem ela, na Vercel, usam o AI Gateway |
| `AI_GATEWAY_API_KEY` | Opcional. Só para usar o AI Gateway fora da Vercel; na Vercel ele entra sozinho |
| `AGENTE_MODELO` | Opcional. Modelo no AI Gateway, ou vários separados por vírgula, tentados em ordem (padrão `google/gemini-3.6-flash`) |
| `AGENTE_MODELO_GOOGLE` | Opcional. Modelos com a chave do Google, separados por vírgula e tentados em ordem quando um está cheio ou sem cota (padrão `gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.8-flash`) |
| `WHATSAPP_TOKEN` | Token de acesso da WhatsApp Cloud API (usuário do sistema) |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador do número na Cloud API |
| `WHATSAPP_VERIFY_TOKEN` | Texto que você escolhe para a Meta confirmar o webhook |
| `WHATSAPP_APP_SECRET` | Segredo do app na Meta, para conferir a assinatura de cada mensagem |
| `WHATSAPP_NUMERO` | O número do agente como as oficinas veem (ex.: `+55 21 99999-0000`) |
| `WHATSAPP_API_VERSAO` | Opcional. Versão da Graph API (padrão `v23.0`) |
| `SITE_URL` | Opcional. Endereço do site nas respostas do agente (padrão `https://revisai.howlks.com`) |
| `VOZ_MODELO` | Opcional. Modelos de voz das perguntas do passo a passo, separados por vírgula (padrão `gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview`). Sem a chave do Google, o navegador lê as perguntas |
| `REVISAI_PIX_TIPO`, `REVISAI_PIX_CHAVE`, `REVISAI_PIX_NOME`, `REVISAI_PIX_CIDADE` | Opcionais. A chave Pix do Revisaí (tipo `cnpj`, `cpf`, `email`, `telefone` ou `aleatoria`, a chave, o nome e a cidade de quem recebe), para a oficina pagar os pacotes de alertas com QR Code. Sem elas, a equipe combina o pagamento pelo WhatsApp |

Diagnóstico: `/api/saude` mostra se o banco está configurado e respondendo.

### Ligar o agente no WhatsApp

1. Em [developers.facebook.com](https://developers.facebook.com), crie um app do tipo Empresa e adicione o produto WhatsApp. A Meta dá um número de teste; para o número de verdade, cadastre um número que ainda não esteja no aplicativo do WhatsApp.
2. Crie um usuário do sistema no Gerenciador de Negócios, gere um token permanente com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` e preencha as variáveis `WHATSAPP_*` na Vercel.
3. Em WhatsApp, Configuração, cadastre o webhook `https://revisai.howlks.com/api/whatsapp` com o mesmo `WHATSAPP_VERIFY_TOKEN` e assine o campo `messages`.
4. No app da oficina, em Ajustes, Agente no WhatsApp, toque em Ligar o WhatsApp do mecânico e mande o código para o número do agente.

## Como o código está organizado

```
app/                 páginas (App Router)
  (site)/            páginas públicas: início, fornecedores, planos, quem tem carro, cartão, créditos, privacidade
  (cliente)/         páginas que a oficina manda: o orçamento para o cliente e a página da entrega para o entregador
  oficina/           o app da oficina: avisos, orçamentos e ordens, estoque, clientes, carro, ordem por voz, loja, ajustes, etiqueta
  fornecedor/        painel do fornecedor: início, produtos, promoções, pedidos, alertas de preço, plano (entra pelo link de acesso)
  admin/             painel administrativo (com senha)
  api/               catálogo, base de prazos, voz natural, webhook do WhatsApp, mídia do agente, diagnóstico e rotina diária
  acoes.ts           ações do servidor: pedidos, cadastros, sugestões para a base e demanda
components/          interface (app da oficina, painéis, site público, peças comuns)
lib/                 regras sem interface
  manutencao.ts      base de conhecimento: serviços, prazos, uso severo
  oleos.ts           SAE/API/ILSAC/ACEA, normas de montadora, compatibilidade, referências por motor
  agenda.ts          rodagem e vencimentos
  avisos.ts          lista de avisos, etapas e resumo do dia
  recomendacao.ts    recomendação de produtos e demanda dos 30 dias
  catalogo.ts        vitrine, promoções, destaque e patrocínio
  plano.ts           plano grátis, teste e Pro da oficina
  documentos.ts      orçamentos e ordens de serviço; orcamento-link.ts é o link do orçamento para o cliente
  passo.ts, fala.ts  o passo a passo e como as respostas faladas são entendidas
  estoque.ts         estoque e a previsão dos 30 dias
  precos.ts          preço pago e o mesmo produto nas outras lojas
  alertas*.ts        alerta de preço: regras (alertas-dados.ts) e banco (alertas.ts)
  entregas*.ts, pix.ts  acompanhamento do pedido, entrega e o código Pix
  agente/            ordem por voz: transcrição, esquema, instruções, IA, WhatsApp e rascunhos
  marketplace.ts     painel do fornecedor e do admin (servidor)
  store.ts           dados da oficina no aparelho (Zustand + IndexedDB)
supabase/            migrações e seed
tests/               Vitest
```

## Privacidade

Não tem conta nesta versão. Os clientes, serviços, orçamentos, ordens e o estoque da oficina ficam no navegador do aparelho que usa o app (com backup e restauração em Ajustes). O servidor recebe os pedidos da loja (com o endereço de entrega e um número aleatório do aparelho para acompanhar), os alertas de preço (produto, quantidade, preço, cidade e estado; as lojas só veem o nome e o WhatsApp da oficina junto com o pedido), os formulários de interesse (com consentimento), os áudios das ordens por voz só para a IA passar para texto e o texto e as fotos só para ela preencher a ordem (nada fica guardado) e, se a oficina ligar, a previsão de compras sem dados dos clientes. Os áudios, fotos e textos mandados ao agente no WhatsApp ficam num rascunho até a oficina conferir; quando ela confirma ou descarta, ou depois de 30 dias parado, o servidor apaga. A posição do entregador só é mandada com a página da entrega aberta e é apagada quando a entrega termina (ou em no máximo 3 dias). O Pix vai direto da oficina para a loja; o Revisaí guarda só a chave Pix da loja (e as anteriores, para tirar dúvidas), para montar o código.

## Próximos passos

- Login com Google ou e-mail (Supabase Auth), com os dados do aparelho subindo para a nuvem e o plano Pro conferido no servidor.
- Acesso para a equipe da oficina, com vários aparelhos.
- Lembrete automático para o dono do carro (WhatsApp e e-mail) nas oficinas Pro.
- Pagamento do Pro e dos planos dos fornecedores direto no app (Pix com confirmação automática).
- Pagamento guardado pela plataforma até a entrega, com a comissão separada na hora (precisa de uma conta num intermediador de pagamento).
- Notificação no celular da loja quando chega um alerta de preço (Web Push).

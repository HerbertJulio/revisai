# Revisaí

**Your customer forgets the oil change. The shop reminds them first.**

Revisaí is a web app for auto repair shops in Brazil. Every service the shop records (oil change, filters, brakes, tires, belts, inspection) gets a due date by time **and** by mileage, whichever comes first. When a car gets close, the shop sees it as soon as the app opens and sends the customer a ready-made WhatsApp message with one tap. Next to each reminder, the built-in store suggests the right product for that car (viscosity, API and OEM spec from the owner's manual) with the suppliers' current deals.

*Leia em português: [README.pt-BR.md](README.pt-BR.md)*

## What it does

**For the shop** (`/oficina`)

- **Reminders by date or mileage.** Each car's monthly mileage is estimated from its odometer history (or the customer's estimate), so the app predicts when it will hit the km limit.
- **Daily summary when the app opens**: how many customers to contact, who is overdue, who is booked for today. Optional browser notification and app badge.
- **One-tap WhatsApp** with an editable message template, then *contacted → booked → service done*. Customers who did not answer come back to the list after a week.
- **Quotes and service orders, step by step.** One flow for both, by touch or by voice: the app asks out loud (which car, the plate, the mileage, who owns it, what was done) and understands the answers, then shows the parts to pick with photos, like an online store ("which oil was used?"). Quotes can be free or paid (the inspection fee is deducted when the customer approves). The customer opens the quote link, unticks what they do not want now and approves through the shop's WhatsApp; the approved quote becomes a service order that is already filled in. Finishing the order records the service (which drives the reminders) and takes the parts out of stock.
- **Stock**: what the shop has, minimum quantities, entries, usage and counts, and a 30-day forecast (what customers' cars and open orders will use, minus what is on the shelf). When something will run short, the daily summary says so: "you have 25 L and will need 5 more", with the store that has it on sale.
- **Price paid and price comparison**: for each product, what the shop paid last time and what the other stores charge now (oil compared by the liter), including "it went up at every store".
- **Price alert (Pro)**: the shop says how much it wants to pay for a product and the stores in its state answer within 48 hours: accept, counter-offer (another price or a minimum quantity, "24 if you take 10") or decline. The shop picks one and the order goes out at the agreed price and quantity, which the database checks (if the store changes its offer in the meantime, the shop confirms the new one). 10 alerts a month on Pro, extra packs when they run out; alerts nobody answered do not count.
- **Order tracking, Pix and delivery**: each store's part of the order with its status, a Pix QR code (copy and paste too) with the exact amount once the store confirms the order, paid straight to the store, and the courier on a map while the order is on its way. The app shows a notice when a store answers an alert, confirms the payment or ships the order.
- **Service orders by voice.** The mechanic taps the microphone and talks through the job. The audio is saved on the device and turned into text, and the AI fills in the order from that text (plate, mileage, services, findings, recommendations) along with a polished message for the customer. The mechanic checks the fields, can add more by voice or fix the text, and confirms. Audio, text and photos stay on the device.
- **WhatsApp agent.** The mechanic sends audio and photos to the Revisaí number, types *fechar* and the order shows up in the app, ready to review.
- **Car health**: a top view of the car with the remaining life of each item and the recommendations from past orders.
- **Interval suggestions** from a maintenance knowledge base (normal and severe use), the car's manual, a per-product interval base (what the manufacturer recommends) and the shop's own products. Everything is editable.
- **Oil recommendations that respect the manual**: same viscosity, API equal or newer, the OEM spec when required (dexos1 Gen 3, VW 508 88, Fiat 9.55535-GS1, RN17…), never downgrading from synthetic to mineral.
- **Store (marketplace)**: catalog with photos, promotions with minimum quantity and validity, featured stores and sponsored products, the sum of what the shop's customers will need in the next 30 days, cart and order. Prices and totals are recalculated by the database.
- **Windshield sticker** printed at real size (70 × 50 mm) and a **maintenance card** for the customer: each item opens a Google Calendar or phone calendar reminder and a WhatsApp shortcut to book. The card data travels in the URL fragment and never reaches the server.
- **Plans.** Free includes 20 reminders and 5 voice orders a month. Pro unlocks unlimited reminders and voice orders, the WhatsApp agent, the reminder return report, the Google review request and price alerts; it has a 30-day trial on the device and is activated with a code the team creates after payment.

**For suppliers** (`/fornecedor`, with an access link)

- Products with photo, specs and replacement interval; promotions; store orders (only each supplier's part).
- **Price alerts** from shops in the same state, for the categories the store sells: accept, counter-offer or decline. The shop's name and WhatsApp only arrive with the order, if the shop picks that store.
- **Pix and delivery**: the store registers its Pix key and confirms the order; then the shop sees the Pix code, pays through the app and the store confirms the payment. "Out for delivery" creates a link for the courier; with it open on the phone, the shop follows the delivery on the map. The link stops working once the order is delivered.
- **Regional demand**: the sum of what shops that share their forecast are going to buy, totals only and only when at least 3 shops contribute, so nobody can be identified. Ready-made promotion suggestions.
- **Plans**: Vitrine (no monthly fee, 6% commission) and Destaque (R$ 149 a month, 4% commission, the store shows up first). **Boosts** of 7, 15 or 30 days put one product first, with the Sponsored badge.

**For the team** (`/admin`, with a password)

- Monthly summary, orders, website signups, suppliers (plan, commission, access link), promotions, boosts, the interval base (approving shops' suggestions), Pro codes with each code's alert usage, and extra alert packs to release after payment.

## How the due date is calculated

```
due by time = service date + interval in months
due by km   = service km + interval in km
date for km = last odometer reading + (km left ÷ km per day)
due date    = whichever comes first
```

The shop is reminded when the due date is within the chosen lead time (15 days by default) or the estimated km left is below the chosen margin (500 km by default). The logic lives in `lib/agenda.ts` and `lib/avisos.ts` and is covered by tests.

## Stack

Everything has a free tier:

- [Next.js 16](https://nextjs.org) (App Router) and React 19, TypeScript
- Tailwind CSS 4, Archivo variable font (SIL OFL)
- Zustand with IndexedDB for the shop's data (no login in this version)
- [Supabase](https://supabase.com) (Postgres with row level security, and Storage) for the store, orders, the panels and the agent's drafts
- [AI SDK](https://ai-sdk.dev) with the Vercel AI Gateway (free monthly credits) or a free Google AI Studio key (Gemini) for voice orders, in two steps: the audio becomes text, then the text fills in the order
- The browser's speech recognition for the step-by-step flow, and Gemini's text-to-speech (free tier) for the questions, recorded once per sentence and kept in Storage
- Pix BR Code (the Central Bank's static QR format) built in the app, and OpenStreetMap for the delivery map
- Meta's WhatsApp Cloud API for the agent (conversations the mechanic starts are free)
- Vitest for the business rules
- Vercel for hosting, with a daily cron that keeps the free Supabase project awake

## Running locally

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
git clone https://github.com/HerbertJulio/revisai.git
cd revisai
npm install
npm run dev
```

Open http://localhost:3000. Without environment variables the store uses the sample catalog, and orders, the panels and the AI are turned off. To connect the database, create a `.env.local` from `.env.example`.

Other commands:

```bash
npm test          # business rules (Vitest)
npm run typecheck # TypeScript
npm run build     # production build
npm run seed      # regenerates supabase/seed.sql from lib/catalogo-demo.ts
```

## Database

`supabase/migrations/` creates the store tables (`fornecedores`, `produtos`, `promocoes`, `impulsos`), orders, signups, the interval base (`produtos_referencia`), regional demand, Pro subscriptions and the WhatsApp agent tables, plus the Storage buckets (`produtos`, public, and `oficinas`, private). All of them use row level security:

- anyone can read only the active catalog and the approved interval base;
- orders and signups only accept inserts; a trigger checks every ordered product and recalculates price, promotion and total, so the browser never sends a price;
- the admin panel and the server send a key in the `x-revisai-equipe` header; the database keeps only its hash (`privado.chaves`) and the policies open everything else only with that key;
- price alerts (`alertas_preco`, `alertas_respostas`, `alertas_creditos`) and the stores' Pix keys (`fornecedores_pix`) are only reachable with that key; the order trigger honours an agreed price only for the device that sent the alert, for that store's product, between the minimum and the negotiated quantity, at the price the shop saw and only once, and closes the alert in the same transaction; another trigger limits how many alerts a shop can send; every Pix key change is kept in `fornecedores_pix_historico`;
- the courier link is stored as a SHA-256 hash and stops working when the delivery ends (or after 3 days); the courier's position is erased at the end (and a daily job clears any delivery older than 3 days);
- new tables are not exposed to the API.

The browser never talks to Supabase directly: the catalog comes from `/api/catalogo` (cached by the CDN for 5 minutes) and everything else goes through server actions.

## Deploying

The repository is connected to Vercel: every push to `main` deploys and every pull request gets a preview URL. Environment variables:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key, used on the server only |
| `CRON_SECRET` | Protects `/api/cron/manter-ativo`, the daily call that keeps the free database awake |
| `EQUIPE_SENHA` | Password for the admin panel at `/admin` |
| `EQUIPE_CHAVE` | Random key (64 hex characters, `openssl rand -hex 32`) the server sends to Supabase; the database stores only its SHA-256 hash in `privado.chaves`, named `equipe`. It also signs supplier sessions |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional. Free Google AI Studio key; with it, voice orders call Gemini directly. Without it, on Vercel, they use the AI Gateway |
| `AI_GATEWAY_API_KEY` | Optional. Only to use the AI Gateway outside Vercel; on Vercel it authenticates on its own |
| `AGENTE_MODELO` | Optional. AI Gateway model, or several separated by commas, tried in order (default `google/gemini-3.6-flash`) |
| `AGENTE_MODELO_GOOGLE` | Optional. Models used with the Google key, separated by commas and tried in order when one is busy or out of quota (default `gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.8-flash`) |
| `WHATSAPP_TOKEN` | WhatsApp Cloud API access token (system user) |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID in the Cloud API |
| `WHATSAPP_VERIFY_TOKEN` | A string you choose so Meta can verify the webhook |
| `WHATSAPP_APP_SECRET` | Meta app secret, to check the signature of every message |
| `WHATSAPP_NUMERO` | The agent's number as shops see it (e.g. `+55 21 99999-0000`) |
| `WHATSAPP_API_VERSAO` | Optional. Graph API version (default `v23.0`) |
| `SITE_URL` | Optional. Site address used in the agent's replies (default `https://revisai.howlks.com`) |
| `VOZ_MODELO` | Optional. Text-to-speech models for the step-by-step questions, separated by commas (default `gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview`). Without the Google key, the browser reads the questions |
| `REVISAI_PIX_TIPO`, `REVISAI_PIX_CHAVE`, `REVISAI_PIX_NOME`, `REVISAI_PIX_CIDADE` | Optional. Revisaí's Pix key (type `cnpj`, `cpf`, `email`, `telefone` or `aleatoria`, the key, the receiver's name and city) so shops can pay for alert packs with a QR code. Without them, the team agrees on payment over WhatsApp |

Diagnostics: `/api/saude` shows whether the database is configured and responding.

### Turning on the WhatsApp agent

1. At [developers.facebook.com](https://developers.facebook.com), create a Business app and add the WhatsApp product. Meta provides a test number; for the real one, register a number that is not in the WhatsApp app yet.
2. Create a system user in Business Manager, generate a permanent token with `whatsapp_business_messaging` and `whatsapp_business_management`, and fill in the `WHATSAPP_*` variables on Vercel.
3. In WhatsApp, Configuration, set the webhook to `https://revisai.howlks.com/api/whatsapp` with the same `WHATSAPP_VERIFY_TOKEN` and subscribe to the `messages` field.
4. In the shop app, under Ajustes, Agente no WhatsApp, tap Ligar o WhatsApp do mecânico and send the code to the agent's number.

## Code layout

```
app/                 pages (App Router)
  (site)/            public pages: home, suppliers, plans, car owners, card, photo credits, privacy
  (cliente)/         pages the shop sends out: the quote for the customer and the courier's delivery page
  oficina/           the shop app: reminders, quotes and orders, stock, customers, car, voice order, store, settings, sticker
  fornecedor/        supplier panel: home, products, promotions, orders, price alerts, plan (signed in through the access link)
  admin/             admin panel (password protected)
  api/               catalog, interval base, natural voice, WhatsApp webhook, agent media, diagnostics and daily cron
  acoes.ts           server actions: orders, signups, interval suggestions and demand
components/          UI (shop app, panels, public site, shared pieces)
lib/                 rules without UI
  manutencao.ts      maintenance knowledge base: services, intervals, severe use
  oleos.ts           SAE/API/ILSAC/ACEA, OEM specs, compatibility, engine references
  agenda.ts          mileage estimate and due dates
  avisos.ts          reminder list, stages and daily summary
  recomendacao.ts    product recommendations and 30-day demand
  catalogo.ts        storefront, promotions, featured stores and sponsorships
  plano.ts           the shop's free, trial and Pro plans
  documentos.ts      quotes and service orders; orcamento-link.ts is the customer's quote link
  passo.ts, fala.ts  the step-by-step flow and how spoken answers are understood
  estoque.ts         stock and the 30-day forecast
  precos.ts          price paid and the same product in other stores
  alertas*.ts        price alerts: rules (alertas-dados.ts) and database (alertas.ts)
  entregas*.ts, pix.ts  order tracking, delivery and the Pix code
  agente/            voice orders: transcription, schema, instructions, AI, WhatsApp and drafts
  marketplace.ts     supplier and admin panels (server)
  store.ts           the shop's data on the device (Zustand + IndexedDB)
supabase/            migrations and seed
tests/               Vitest
```

## Privacy

There are no accounts in this version. The shop's customers, services, quotes, orders and stock live in the browser of the device that uses the app (with backup and restore in Settings). The server receives store orders (with the delivery address and a random device number for tracking), price alerts (product, quantity, price, city and state; stores only see the shop's name and WhatsApp with the order), signup forms (with consent), voice order audio only so the AI can turn it into text and the text and photos only so it can fill in the order (nothing is kept) and, if the shop turns it on, its purchase forecast without customer data. Audio, photos and text sent to the WhatsApp agent stay in a draft until the shop reviews it; once the shop confirms or discards it, or after 30 days without activity, the server deletes them. The courier's position is only sent while the delivery page is open and is erased when the delivery ends (or after 3 days at most). Pix payments go straight from the shop to the store; Revisaí only keeps the store's Pix key (and the previous ones, to settle disputes) to build the code.

## Next steps

- Sign in with Google or email (Supabase Auth), moving the device's data to the cloud and checking the Pro plan on the server.
- Access for the shop's team, on several devices.
- Automatic reminders to car owners (WhatsApp and email) for Pro shops.
- Paying for Pro and supplier plans inside the app (Pix with automatic confirmation).
- Payment held by the platform until delivery, with the commission split automatically (needs a payment provider account).
- Push notifications for stores when a price alert arrives (Web Push).

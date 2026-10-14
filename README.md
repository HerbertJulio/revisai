# Revisaí

**Your customer forgets the oil change. The shop reminds them first.**

Revisaí is a web app for auto repair shops in Brazil. Every service the shop records (oil change, filters, brakes, tires, belts, inspection) gets a due date by time **and** by mileage, whichever comes first. When a car gets close, the shop sees it as soon as the app opens and sends the customer a ready-made WhatsApp message with one tap. Next to each reminder, the built-in store suggests the right product for that car (viscosity, API and OEM spec from the owner's manual) with the suppliers' current deals.

*Leia em português: [README.pt-BR.md](README.pt-BR.md)*

## What it does

**For the shop** (`/oficina`)

- **Reminders by date or mileage.** Each car's monthly mileage is estimated from its odometer history (or the customer's estimate), so the app predicts when it will hit the km limit.
- **Daily summary when the app opens**: how many customers to contact, who is overdue, who is booked for today. Optional browser notification and app badge.
- **One-tap WhatsApp** with an editable message template, then *contacted → booked → service done*. Customers who did not answer come back to the list after a week.
- **Service orders by voice.** The mechanic taps the microphone and talks through the job. The audio is saved on the device and turned into text, and the AI fills in the order from that text (plate, mileage, services, findings, recommendations) along with a polished message for the customer. The mechanic checks the fields, can add more by voice or fix the text, and confirms. Audio, text and photos stay on the device.
- **WhatsApp agent.** The mechanic sends audio and photos to the Revisaí number, types *fechar* and the order shows up in the app, ready to review.
- **Car health**: a top view of the car with the remaining life of each item and the recommendations from past orders.
- **Interval suggestions** from a maintenance knowledge base (normal and severe use), the car's manual, a per-product interval base (what the manufacturer recommends) and the shop's own products. Everything is editable.
- **Oil recommendations that respect the manual**: same viscosity, API equal or newer, the OEM spec when required (dexos1 Gen 3, VW 508 88, Fiat 9.55535-GS1, RN17…), never downgrading from synthetic to mineral.
- **Store (marketplace)**: catalog with photos, promotions with minimum quantity and validity, featured stores and sponsored products, the sum of what the shop's customers will need in the next 30 days, cart and order. Prices and totals are recalculated by the database.
- **Windshield sticker** printed at real size (70 × 50 mm) and a **maintenance card** for the customer: each item opens a Google Calendar or phone calendar reminder and a WhatsApp shortcut to book. The card data travels in the URL fragment and never reaches the server.
- **Plans.** Free includes 20 reminders and 5 voice orders a month. Pro unlocks unlimited reminders and voice orders, the WhatsApp agent, the reminder return report and the Google review request; it has a 30-day trial on the device and is activated with a code the team creates after payment.

**For suppliers** (`/fornecedor`, with an access link)

- Products with photo, specs and replacement interval; promotions; store orders (only each supplier's part).
- **Regional demand**: the sum of what shops that share their forecast are going to buy, totals only and only when at least 3 shops contribute, so nobody can be identified. Ready-made promotion suggestions.
- **Plans**: Vitrine (no monthly fee, 6% commission) and Destaque (R$ 149 a month, 4% commission, the store shows up first). **Boosts** of 7, 15 or 30 days put one product first, with the Sponsored badge.

**For the team** (`/admin`, with a password)

- Monthly summary, orders, website signups, suppliers (plan, commission, access link), promotions, boosts, the interval base (approving shops' suggestions) and Pro codes.

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
  oficina/           the shop app: reminders, customers, car, record service, voice order, store, settings, sticker
  fornecedor/        supplier panel: home, products, promotions, orders, plan (signed in through the access link)
  admin/             admin panel (password protected)
  api/               catalog, interval base, WhatsApp webhook, agent media, diagnostics and daily cron
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
  agente/            voice orders: transcription, schema, instructions, AI, WhatsApp and drafts
  marketplace.ts     supplier and admin panels (server)
  store.ts           the shop's data on the device (Zustand + IndexedDB)
supabase/            migrations and seed
tests/               Vitest
```

## Privacy

There are no accounts in this version. The shop's customers and services live in the browser of the device that uses the app (with backup and restore in Settings). The server receives store orders, signup forms (with consent), voice order audio only so the AI can turn it into text and the text and photos only so it can fill in the order (nothing is kept) and, if the shop turns it on, its purchase forecast without customer data. Audio, photos and text sent to the WhatsApp agent stay in a draft until the shop reviews it; once the shop confirms or discards it, or after 30 days without activity, the server deletes them.

## Next steps

- Sign in with Google or email (Supabase Auth), moving the device's data to the cloud and checking the Pro plan on the server.
- Access for the shop's team, on several devices.
- Automatic reminders to car owners (WhatsApp and email) for Pro shops.
- Paying for Pro and supplier plans inside the app (Pix).

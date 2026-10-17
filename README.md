# Revisaí

**Your customer forgets the oil change. The shop reminds them first.**

Revisaí is a web app for auto repair shops, with a parts marketplace for the stores in the region and an area for the team. Every service the shop records (oil change, filters, brakes, tires, belts, inspections) gets a due date by time **and** by mileage, whichever comes first. When a car gets close, the shop sees it as soon as it opens the app and sends a ready WhatsApp message with one tap. From the quote to the warranty, from the day's cash to buying parts, everything is in one place.

*Leia em português: [README.pt-BR.md](README.pt-BR.md)*

## What it does

**For the shop** (`/oficina`)

- **Reminders by date or mileage**, with the day's summary when the app opens, one-tap WhatsApp and the steps *reminded → booked → done*.
- **Quotes and service orders step by step**, by touch or by voice. The customer gets a link, sees the quote, unchecks what they don't want now and approves; the approval stores date, time, device and what was shown, and holds as proof. Refused items become reminders to offer later.
- **Service progress** the customer follows through the link, **check-in checklist** with photos, damage marked on the car drawing and a signature on the phone, **digital warranty** anyone can check with the plate and the certificate code, and a **verified service history** for when the car is sold.
- **Voice service orders** and a **WhatsApp agent**: the mechanic talks or sends voice notes and photos, and the order arrives filled in for review.
- **Schedule** by day and week with the mechanics, free slots and WhatsApp confirmation; **online booking** through a link the shop shares; **service kit**, putting the parts for the booked cars in the store cart.
- **Finance**: payables and receivables, the day's cash, installments, store credit with reminders and Pix at the counter. **Reports** on revenue, average ticket, cars per month, parts margin and quote approval, **commission per mechanic** and a **comparison** with the average of shops in the city.
- **Customer charges** over WhatsApp with a Pix page for the exact amount, a **maintenance club** with a monthly fee, and **invoices** for services (NFS-e) and parts (NF-e) through an invoicing provider.
- **Car lookup by plate** with the FIPE price, **stock entry from the purchase invoice XML** and by barcode, **loyalty points** on every service, manufacturer **recalls** turned into reminders for the matching cars, and a **satisfaction survey**.
- **Stock** with a 30-day forecast, **last price paid and comparison** with other stores, and **price alerts** for the stores to answer.
- **Marketplace**: catalog of the region's stores with photos, delivery time, minimum order, stock, fitment for the car in the quote, prices agreed with each shop, cashback, sales on credit, Pix straight to the store, delivery on a map, returns and warranty for parts.
- **Shop team**: owner, manager and mechanic, each with their own account. Mechanics don't see money.
- **Works offline**: data lives on the device and syncs with the server when there is an account, across all the shop's devices, in real time.
- **Plans**: the free plan has 20 reminders and 5 voice orders a month. Pro unlocks the rest, with a 30-day trial, and is billed by automatic Pix, card or bank slip, with an invoice for every month.

**For stores** (`/fornecedor`)

- Owner and seller accounts, products with photos and specs, catalog by application (make, model and year), stock, delivery time, and import by spreadsheet or through the stock and price API.
- Orders with status and history, price alerts from shops in the state, special prices per shop, minimum order, cashback, sales on credit for the shops the store trusts, returns and warranty.
- Protected Pix key (a change only takes effect after 24 hours, with a notice), monthly statement, pay-per-click ads, the Featured plan with monthly billing, and the store's reputation.

**For the team** (`/admin`, with the e-mail code and an authenticator app)

- Subscription metrics and cohorts, marketplace dashboard, usage per shop, funnel and anti-fraud, store tax ID (CNPJ) checks, product and store moderation, purchase limit for new shops, support inbox, satisfaction survey, Pro codes, billing, the service intervals database, access log, and export or deletion of a person's data (LGPD).

## How the due date is calculated

```
due by date    = service date + interval in months
due by mileage = service mileage + interval in km
date by km     = last odometer reading + (km left ÷ km per day)
due date       = whichever comes first
```

The shop is reminded when the due date enters the chosen lead time (15 days by default) or when fewer km are left than the chosen margin (500 km by default). The rule lives in `lib/agenda.ts` and `lib/avisos.ts`, with tests.

## Technology

- [Next.js 16](https://nextjs.org) (App Router, server actions) and React 19, TypeScript, Tailwind CSS 4
- Zustand with IndexedDB for the shop's data on the device, synced with Supabase (one row per item, with a transaction watermark and realtime)
- [Supabase](https://supabase.com): Postgres with RLS on every table, Auth (e-mail code, Google and an authenticator app for the team), Storage and Realtime
- [AI SDK](https://ai-sdk.dev) with Gemini for voice orders
- Notifications through a queue in the database: e-mail (Resend), WhatsApp (Meta templates) and phone notifications (Web Push)
- Pix with the BR Code built in the app; Pro billing through Asaas or Efí (automatic Pix); shop invoices through Focus NFe
- Vitest for business rules and database permissions; Playwright for browser tests
- Vercel for hosting, with a daily routine (`/api/cron/manter-ativo`)

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
git clone https://github.com/HerbertJulio/revisai.git
cd revisai
npm install
npm run dev
```

Open http://localhost:3000. Without environment variables, the shop app runs without an account (data stays on the device) and the marketplace uses the sample catalog.

To have the database, login and API locally, without Docker:

```bash
npm run banco:local -- start   # Postgres 17, login (GoTrue), API (PostgREST) and a gateway at http://127.0.0.1:54321
cp .env.example .env.local     # and use the local values shown in the file
npm run dev
```

Login code e-mails show up at http://127.0.0.1:54321/__mail.

Other commands:

```bash
npm test             # business rules (Vitest)
npm run test:banco   # permissions, triggers and functions on the local database
npm run typecheck    # TypeScript
npm run build        # production build
```

## Database

`supabase/migrations/` creates everything: accounts and roles (`oficina_membros`, `fornecedor_membros`, `privado.equipe`), the shop's data (`registros`, one per item, with unique numbering of quotes and orders), the marketplace, orders, billing, customer links, the notification queue and the access log. The main rules:

- RLS on every table, by shop, by store and by role; mechanics don't receive the collections with money;
- functions that change data check who is calling, and new tables are not exposed to the API;
- prices, totals, commission, cashback and quotas are computed by the database, never by the browser;
- customer and courier links are stored only as hashes, and so are the stores' API keys;
- stores get price alerts without knowing which shop sent them, and the store catalog is served only by the server (without an account, the API returns nothing about the stores);
- the server uses a system key only in routines, webhooks and to build the catalog (the database keeps its hash in `privado.chaves`).

## Deploy

The repository is connected to Vercel: every push to `main` deploys, and the deployment runs the tests before the build (if a test fails, nothing goes live). GitHub runs the type check, the tests, the database tests and the build on every change, makes a weekly database backup and checks the site's health.

All environment variables are in [`.env.example`](.env.example), with what each one turns on. Diagnostics: `/api/saude` and the `/status` page.

### Turning on the WhatsApp agent

1. At [developers.facebook.com](https://developers.facebook.com), create a Business app and add the WhatsApp product. Meta provides a test number; for the real one, register a number that is not in the WhatsApp app yet.
2. Create a system user in Business Manager, generate a permanent token with `whatsapp_business_messaging` and `whatsapp_business_management`, and fill in the `WHATSAPP_*` variables on Vercel.
3. In WhatsApp, Configuration, set the webhook to `https://revisai.howlks.com/api/whatsapp` with the same `WHATSAPP_VERIFY_TOKEN` and subscribe to the `messages` field.
4. In the shop app, under Ajustes, Agente no WhatsApp, tap Ligar o WhatsApp do mecânico and send the code to the agent's number.

## How the code is organized

```
app/                 pages (App Router)
  (site)/            public pages: home, plans, stores, comparison, status and legal documents
  (cliente)/         pages the shop's customer opens: quote and progress link, booking, warranty and delivery
  entrar/, conta/    login and account (shop or store)
  oficina/           the shop app
  fornecedor/        the store panel
  admin/             the team area
  api/               catalog, notifications, payments, WhatsApp, voice, health and the daily routine
components/          interface (shop, store, team, site, customer and shared pieces)
lib/                 rules without interface (due dates, documents, stock, finance, schedule, billing, notifications, marketplace...)
supabase/            migrations and seed
scripts/             local database and seed
tests/               Vitest (tests/banco: permissions in Postgres)
```

## Privacy

Each shop sees only its own data, and each store only its own orders and products. The shop's data lives on the device and, with an account, on the server, separated by shop. The shop's customer sees only what the shop sent through the link, and the link stops working when the shop revokes it or when it expires. Audio and photos from voice orders go to the AI only to fill in the order. The courier's location is deleted when the delivery ends. Revisaí does not store the shop's digital certificate or its password. Retention and deletion periods are in the [privacy policy](https://revisai.howlks.com/privacidade).

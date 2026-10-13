# Revisaí

**Your customer forgets the oil change. The shop reminds them first.**

Revisaí is a web app for auto repair shops in Brazil. Every service the shop records (oil change, filters, brakes, tires, belts, inspection) gets a due date by time **and** by mileage, whichever comes first. When a car gets close, the shop sees it as soon as the app opens and sends the customer a ready-made WhatsApp message with one tap. Next to each reminder, the built-in store suggests the right product for that car (viscosity, API and OEM spec from the owner's manual) with the suppliers' current deals.

*Leia em português: [README.pt-BR.md](README.pt-BR.md)*

## What it does

- **Reminders by date or mileage.** Each car's monthly mileage is estimated from its odometer history (or the customer's estimate), so the app predicts when it will hit the km limit.
- **Daily summary when the app opens**: how many customers to contact, who is overdue, who is booked for today. Optional browser notification and app badge.
- **One-tap WhatsApp** with an editable message template, then *contacted → booked → service done*. Customers who did not answer come back to the list after a week.
- **Interval suggestions** from a maintenance knowledge base (normal and severe use), the car's manual interval and the product used (a mineral oil shortens it; iridium plugs last longer). Everything is editable.
- **Oil recommendations that respect the manual**: same viscosity, API equal or newer, the OEM spec when required (dexos1 Gen 3, VW 508 88, Fiat 9.55535-GS1, RN17…), never downgrading from synthetic to mineral.
- **Store (marketplace)**: catalog, promotions with minimum quantity and validity, the sum of what the shop's customers will need in the next 30 days, cart and order. Prices and totals are recalculated by the database.
- **Windshield sticker** printed at real size (70 × 50 mm) and a **maintenance card** for the customer, with calendar reminders (.ics). The card data travels in the URL fragment and never reaches the server.
- **Lead capture** for shops (Plus plan), suppliers and car owners.
- Works on phones and desktops, light and dark themes, installable (PWA manifest).

## How the due date is calculated

```
due by time = service date + interval in months
due by km   = service km + interval in km
date for km = last odometer reading + (km left ÷ km per day)
due date    = whichever comes first
```

The shop is reminded when the due date is within the chosen lead time (15 days by default) or the estimated km left is below the chosen margin (500 km by default). The logic lives in `lib/agenda.ts` and `lib/avisos.ts` and is covered by tests.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) and React 19, TypeScript
- Tailwind CSS 4, Archivo variable font (SIL OFL)
- Zustand with IndexedDB for the shop's data (no login in this version)
- [Supabase](https://supabase.com) (Postgres with row level security) for the store catalog, orders and leads
- Vitest for the business rules
- Vercel for hosting, with a daily cron that keeps the free Supabase project awake

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
git clone https://github.com/HerbertJulio/revisai.git
cd revisai
npm install
npm run dev
```

Open http://localhost:3000. Without environment variables the store uses the sample catalog and orders are disabled. To connect a database, create `.env.local` (see `.env.example`):

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Other commands:

```bash
npm test          # business rules (Vitest)
npm run typecheck # TypeScript
npm run build     # production build
npm run seed      # regenerate supabase/seed.sql from lib/catalogo-demo.ts
```

## Database

`supabase/migrations/` creates the tables `fornecedores`, `produtos`, `promocoes`, `pedidos` and `interessados`, with row level security:

- anyone can read the active catalog;
- orders and leads accept inserts only (nobody reads them through the API);
- a trigger checks every product of an order and recalculates unit prices, promotions and the total, so the browser never sends prices;
- new tables are not exposed to the API by default.

Run the migration and then `supabase/seed.sql` in the Supabase SQL editor (or with the Supabase CLI). Orders and leads are read in the Supabase dashboard.

The browser never talks to Supabase directly: the catalog comes from `/api/catalogo` (cached by the CDN for 5 minutes) and orders and leads go through server actions (`app/acoes.ts`).

## Deploy

The repository is connected to Vercel: every push to `main` goes live and every pull request gets a preview. Environment variables:

| Variable | What for |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key, used only on the server |
| `CRON_SECRET` | Protects `/api/cron/manter-ativo`, the daily call that keeps the free database awake |

Diagnostics: `/api/saude` shows whether the database is configured and responding.

## How the code is organized

```
app/                 pages (App Router)
  (site)/            public pages: home, suppliers, plans, car owners, card, privacy
  oficina/           the shop app: reminders, customers, car, register service, store, settings, sticker
  api/               catalog, health check and cron
  acoes.ts           server actions: orders and leads
components/          UI (shop app, public site, shared pieces)
lib/                 rules without UI
  manutencao.ts      maintenance knowledge base: services, intervals, severe use
  oleos.ts           SAE/API/ILSAC/ACEA, OEM specs, compatibility, references by engine
  agenda.ts          mileage estimate and due dates
  avisos.ts          reminder list, stages and daily summary
  recomendacao.ts    product recommendation and 30-day demand
  store.ts           shop data on the device (Zustand + IndexedDB)
supabase/            migration and seed
tests/               Vitest
```

## Privacy

There is no account in this version. The shop's customers and services stay in the browser of the device that uses the app (with backup and restore in Settings). The server only receives store orders and lead forms, with consent.

## Next steps

- Login with Google or e-mail (Supabase Auth). Shops that are not customers yet get the free trial or the Plus plan; local data moves to the cloud on first login.
- Automatic reminders to the car owner (WhatsApp and e-mail) for Plus shops.
- Supplier portal to manage products, promotions and orders.

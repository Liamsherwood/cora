# Cora

## Local development

Install Git and Node.js 24, and make sure you have access to the Cora repository.
Each teammate runs Supabase locally with Docker. Local development requires no
Supabase account, paid plan, or shared credentials.

### 1. Start Docker

Install and open Docker Desktop, or run `colima start` if you use Colima on
macOS. Wait for Docker to start, then run `docker info` to check that it is ready.
[Docker installation guide](https://docs.docker.com/get-docker/)

### 2. Clone the repo and start Supabase

Run these commands from a terminal. The first Supabase startup downloads the
Docker images. [Supabase CLI guide](https://supabase.com/docs/guides/local-development/cli/getting-started)

```bash
git clone https://github.com/Liamsherwood/cora.git
cd cora
npm ci
npx --yes supabase@2.114.0 start
```

### 3. Set up environment variables

On a fresh checkout, copy the tracked template to the gitignored local file.

```bash
cp .env.example .env.local
```

| Variable | Local value |
| --- | --- |
| `DATABASE_URL` | Local PostgreSQL connection string, already set in the template. |
| `NEXT_PUBLIC_SUPABASE_URL` | Local Supabase API URL, already set in the template. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Paste the **Publishable** key printed by your local Supabase CLI. |

Run `npx --yes supabase@2.114.0 status` to see the local key again. Leave
`DATABASE_URL_UNPOOLED` and `SUPABASE_DB_CA_CERT` unset for the default local
setup. Use `.env.example` to share variable names and local defaults. Keep secret
values in your gitignored `.env.local` or in Vercel for hosted deployments.

### 4. Migrate and run the app

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run db:seed` loads the demo data from `data/seed.json` and registers the
partners in `data/partners/`. It does nothing if data already exists; use
`npm run db:seed -- --reset` to wipe every table and start over.

Open [Cora](http://localhost:3000) or [Supabase Studio](http://127.0.0.1:64323).
The local stack includes Auth and a private `documents` storage bucket. Drizzle
manages the application migrations in `drizzle/`. Run `npm run db:migrate` again
after pulling changes that include new Drizzle migrations.

To stop the local Supabase services, run `npx --yes supabase@2.114.0 stop`.

#### Without Docker

The app and the tests only need PostgreSQL. On macOS without Docker, Homebrew's
Postgres works (Supabase Auth, Storage and Studio are then not available):

```bash
brew install postgresql@17
brew services start postgresql@17
psql -d postgres -c "CREATE ROLE cora LOGIN PASSWORD 'cora'"
psql -d postgres -c "CREATE DATABASE cora OWNER cora"
psql -d postgres -c "CREATE DATABASE cora_test OWNER cora"
```

Then set in `.env.local`:

```bash
DATABASE_URL=postgresql://cora:cora@127.0.0.1:5432/cora
TEST_DATABASE_URL=postgresql://cora:cora@127.0.0.1:5432/cora_test
```

The `cora` role is deliberately not a superuser: as the owner of the tables it
can read and write with row-level security on, like the `postgres` role on
Supabase, while other roles see nothing until policies exist.

#### Tests

```bash
npm test
```

Runs against `TEST_DATABASE_URL`. Every run drops and re-migrates that
database's schema, so its name must end in `_test`; the setup refuses anything
else and creates the database if it is missing.

## WhatsApp agent

Cora replies to inbound text about property management and keeps up to four
recent exchanges per conversation for context. Replies use Vercel AI Gateway.
The pilot handles conversation only. Case creation and staff handoff remain
manual.

1. Open your Meta app and go to **WhatsApp → API Setup** (or **Use cases →
   Customize → API Setup**). Select the sender number and copy its **Phone Number
   ID** into `WHATSAPP_PHONE_NUMBER_ID`. Use a temporary **Access token** in
   `WHATSAPP_ACCESS_TOKEN` for a quick test, or use a system user access token
   with `whatsapp_business_messaging` and access to the WhatsApp account for an
   ongoing deployment. For a Meta test number, add your phone as a test
   recipient. If you only verified ownership of your own business number, check
   its [Cloud API registration](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration).
   [Meta Cloud API setup](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
2. Copy the **App secret** from **App settings → Basic** into
   `WHATSAPP_APP_SECRET`. Generate a separate verification token with
   `openssl rand -hex 32` and save it as `WHATSAPP_VERIFY_TOKEN`. Put these
   values in the gitignored `.env.local` for local use or in Vercel’s
   server-side environment variables for the deployment that will receive the
   callback.
3. Run `npm run db:migrate` against the intended database before running or
   deploying the agent. Use the hosted migration command below for hosted
   Supabase. AI Gateway uses Vercel OIDC on a linked deployment. For local
   development, use a current OIDC token or supply `AI_GATEWAY_API_KEY`.
   [AI Gateway authentication](https://vercel.com/docs/ai-gateway/authentication)
4. In Meta, open **WhatsApp → Configuration** (or **Use cases → Customize →
   Configuration**). Set the callback URL to
   `https://<public-cora-host>/api/webhooks/whatsapp`. The URL must be reachable
   by Meta over HTTPS without a login. Enter the same `WHATSAPP_VERIFY_TOKEN`,
   click **Verify and save**, and subscribe to the `messages` field.
   [Meta webhook setup](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint)
5. From your own WhatsApp account, send the business number a text such as
   “My kitchen tap is leaking.” Cora should reply with a follow-up question.
   Reply with another detail to test conversation context.

## Database

Cora uses PostgreSQL and Drizzle for typed SQL and versioned migrations. The
schema lives in `lib/db/schema` and migrations live in `drizzle/`. Import
`getDb()` from `@/lib/db` in server-side data access code and import tables from
`@/lib/db/schema` to build queries. [Database schema](lib/db/schema)

### Hosted Supabase on Vercel

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from
the hosted project's Connect panel. [Supabase Next.js setup](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs#5-declare-supabase-environment-variables)

In Vercel, set the server-side `DATABASE_URL` to the Supabase **Session pooler**
connection string from the project's Connect panel with `sslmode=verify-full`.
Set `SUPABASE_DB_CA_CERT` to the PEM certificate from Supabase Database Settings.
For migrations, use the session pooler or set `DATABASE_URL_UNPOOLED` to the
direct connection string from an IPv6-capable network.
[Supabase connection settings](https://supabase.com/docs/guides/database/connecting-to-postgres#ssl)

To migrate the hosted database from this checkout, load its credentials from a
separate `.env.supabase.local` file.

```bash
node --env-file=.env.supabase.local --run db:migrate
```

After changing a table, run `npm run db:generate -- --name=describe-change`.
Review the generated SQL and commit it with the schema change. Apply migrations
once per database as a release step with `npm run db:migrate`.

### Schema conventions

- Composite foreign keys keep cases, units and assets in the correct property
  and link each service order to consent for its customer and offer provider.
  Order creation must check current consent before sharing data. Revocation can
  be recorded while preserving historical orders.
- Building-wide assets and property-wide cases can omit the unit. Event-driven
  workflows can run without opening a case. Mandates record the granting party.
- EUR amounts and MEA shares use exact decimals, which Drizzle returns as
  strings. Contract dates use `date` and event timestamps use `timestamptz`.
  List fields use text arrays. Variable payloads and workflow steps use `jsonb`.
- Application tables have row-level security enabled. Next.js reads and writes
  through the server-side database client. Browser roles need explicit policies
  before they can access application rows through Supabase.
- Store uploaded files in the private `documents` bucket and save a stable object
  reference in `documents.url`. Authorize access before streaming a file or
  issuing a short-lived download URL. [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals#private-buckets)

## Partner Connect demo

Move-in → internet for the reltix track: a centrix event fires, the tenant is
reached by a voice agent or the portal, consents in one step, the partner gets a
pre-filled order, and the contract lands on the unit. A second partner
(electricity) plugs into the same event through a manifest only. Background and
decisions are in [`CONTEXT.md`](CONTEXT.md).

Click path (after `npm run db:seed` and `npm run dev`):

1. **/centrix**: unit 4B → *Fire event: tenant.move_in* (two workflows appear)
2. *Call tenant (voice agent)* (simulated without ElevenLabs keys) or *Approve &
   send to portal*
3. **Tenant portal (Lena)** → *Agree & order* (shows exactly what is shared)
4. **/partner** → *Accept order* → *Mark as live* (signed webhooks)
5. Back in **/centrix**: contract on the unit, timeline, cost per case

*Reset demo data* in the centrix sidebar restores the seed (`DEMO_MODE=true`).

| Folder            | What                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `lib/workflow/`   | state machine, offer and lead-time maths, consent, minimisation   |
| `lib/connectors/` | partner connector spec v1 (zod) and the partner registry          |
| `lib/centrix/`    | mock centrix API over the portfolio tables                        |
| `lib/partner/`    | HMAC-SHA256 webhook signing and verification                      |
| `lib/voice/`      | ElevenLabs outbound call and context                              |
| `app/api/`        | HTTP routes; `app/(demo)/` the three demo screens                 |
| `data/`           | `seed.json` (fixed UUIDs) and one manifest per partner            |

Data model notes: a confirmed `service_orders` row *is* the contract on the unit
(`contract_status` signed/active/cancelled). Money columns are EUR decimals;
the engine and the manifests work in integer cents and convert at the database
boundary (`lib/money.ts`). Workflow states are fixed:
`detected → offer_sent → consent_given → ordered → confirmed → active → closed`,
plus `declined`, `rejected` and `no_eligible_offer`.

Demo environment variables are listed in [`.env.example`](.env.example).
`DATABASE_POOL_MAX` sets the connection pool (default 5; use 1 behind a
transaction pooler). Not built on purpose: route auth (production would use
partner API keys, signed portal links and a property-manager key).

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

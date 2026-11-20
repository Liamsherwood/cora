# Next.js template

This is a Next.js template with shadcn/ui.

## Database

The app uses PostgreSQL for application records and Drizzle for typed SQL and
versioned migrations. The schema lives in [`lib/db/schema`](lib/db/schema).
Import `getDb()` from `@/lib/db` in server-side data access code and import tables
from `@/lib/db/schema` to build queries.

### Local development

Install Git and Node.js 24, and make sure you have access to the Cora repository.

For the current starter UI, clone the repo, run `npm ci`, then run `npm run dev`.
Follow the steps below when you need local PostgreSQL, Auth, or Storage.

#### Start Docker

Install and open Docker Desktop, or run `colima start` if you use Colima on
macOS. Wait for Docker to start, then run `docker info` to check that it is ready.
[Docker installation guide](https://docs.docker.com/get-docker/)

#### Clone and start Supabase

From a terminal, run the commands below. `npx` runs the Supabase CLI at the
specified version. The local stack starts without a Supabase sign-in.
[Supabase CLI guide](https://supabase.com/docs/guides/local-development/cli/getting-started)

```bash
git clone https://github.com/Liamsherwood/cora.git
cd cora
npm ci
cp .env.example .env.local
npx --yes supabase@2.114.0 start
```

Copy the **Publishable** key printed by Supabase into
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Run
`npx --yes supabase@2.114.0 status` to see the key again.

#### Migrate and run the app

```bash
npm run db:migrate
npm run dev
```

Open [Cora](http://localhost:3000) or [Supabase Studio](http://127.0.0.1:64323).
The local stack includes Auth and a private `documents` storage bucket. Drizzle
manages the application migrations in `drizzle/`.

To stop the local Supabase services, run `npx --yes supabase@2.114.0 stop`.

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

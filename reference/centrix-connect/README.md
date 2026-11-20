# centrix Partner Connect – Team Mindforge

Move-in → Internet: a centrix event fires, the tenant is reached by a voice agent or the portal, gives consent in one step, the partner gets a pre-filled order, and the signed contract lands on the unit in centrix. A second partner (electricity) plugs into the same event through a manifest only.

## Run locally (no setup)

```bash
npm install
cp .env.example .env.local     # defaults work; DATABASE_URL empty = embedded Postgres, auto-seeded
npm run dev                    # http://localhost:3000
```

Demo click path:
1. **/centrix** → unit 4B → *Fire event: tenant.move_in* (two workflows appear: internet + energy)
2. *Call tenant (voice agent)* (simulated without ElevenLabs keys) or *Approve & send to portal*
3. **/portal/c_202** → *Agree & order* (consent shows exactly what is shared)
4. **/partner** → *Accept order* → *Mark as live* (signed webhooks)
5. Back in **/centrix**: contract on the unit, timeline, cost per case

*Reset demo data* in the centrix sidebar restores the seed.

## Supabase

```bash
# .env.local: DATABASE_URL = Supabase *transaction pooler* URL (port 6543)
npm run db:migrate             # creates tables from drizzle/
npm run db:seed                # loads data/seed.json + data/partners (add -- --reset to start over)
```

Schema changes: edit `src/db/schema.ts`, then `npm run db:generate` and commit the new file in `drizzle/`.

## Data files (for the data owner)
- `data/seed.json`: one array per table, snake_case field names as in the ER model, fixed string ids (`unit_4b`, `c_202`). Validated on load; errors name the exact field.
- `data/partners/*.json`: one manifest per partner, see `docs/connector-spec.md`.

## Structure

```
src/centrix/     mock centrix API (only place that reads centrix_* tables)
src/connectors/  connector spec (Zod) + partner registry
src/workflow/    state machine, offer/lead-time logic, consent + data minimisation
src/partner/     webhook signing + verification
src/voice/       ElevenLabs outbound call + context
src/app/api/     HTTP routes   ·   src/app/{centrix,portal,partner}  demo screens
test/            unit + integration tests (npm test)
docs/            connector spec, assumptions, voice agent setup
```

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/centrix/events` | Trigger (reltix payload shape: `event, unit_id, contact_id, occurred_at, data`), idempotent by `id` |
| GET | `/api/centrix/units/:id` | Unit snapshot + workflows |
| GET | `/api/workflows/:id` | State, offer, messages, audit, cost metrics |
| POST | `/api/workflows/:id/contact` | `{channel: voice\|portal}` |
| POST | `/api/workflows/:id/accept` | `{consent: true}` – consent + order in one step |
| POST | `/api/workflows/:id/decline` | Nothing is shared |
| POST | `/api/workflows/:id/revoke-consent` | Withdraw consent; partner feed shows the order redacted |
| POST | `/api/voice/tools/decision` | ElevenLabs server tool (header `x-tool-secret`) |
| POST | `/api/partner/webhook/:partnerId` | Signed partner status updates |
| GET | `/api/partner/orders` | Partner dashboard feed |
| GET/POST | `/api/partners` | List / register a manifest; `/api/partners/validate` dry run |
| POST | `/api/demo/reset` | Demo only (`DEMO_MODE=true`) |

## Checks

```bash
npm test          # 20 tests: business days, spec validation, minimisation, signatures, full flow, races
npm run typecheck
npm run build
```

## Deploying (Vercel)
Set all variables from `.env.example`. Use Supabase (`DATABASE_URL`) in production – the embedded database is in-memory and resets on every cold start. Set `DEMO_MODE=false` outside the demo: it disables reset, partner registration and the partner simulator.

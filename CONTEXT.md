# CONTEXT – read this first

Team Mindforge (Anis, Giacomo, Gabriele) at the MAIN AI Hackathon "One Future", Maastricht, 20–21 Nov 2026.
Track: **reltix – "Plug a Partner into centrix"**. Submission: Sat 21 Nov, 10:30 (sharp). Whole team must be at the church at 11:00.

## The client
reltix GmbH (Düsseldorf, founded 2025) is a property manager (Hausverwaltung) that runs on its own AI operating system, **centrix**. It manages the buildings itself (~70 staff, ~10,000 clients per co-founder Jan Horstmann). Revenue is a fee per unit per month, so every manual minute per case eats margin. Their vision: centrix becomes the hub every service provider around a building plugs into (internet, energy, craftsmen, insurance…).

## The challenge (official brief)
Pick one ecosystem partner, integrate it into centrix, turn a moment in a property's life into a finished outcome **with zero forms**:
1. **Detect the moment** – when and for whom the service matters
2. **Hand over context** – pre-fill what the partner needs from centrix
3. **Hold the conversation** – easiest channel for everyone (voice, portal, message, property-manager assistant); at least one channel reaches the resident; bonus if channels share context (call continues in portal)
4. **Close the loop** – keep everyone informed, write the result (contract/appointment/invoice) back to the unit

Deliverables: **(A)** working demo: event → resident → partner → result on the unit; **(B)** partner connector spec so the next partner plugs in the same way.
No reltix API or dataset: we mock centrix ourselves. "Keep it realistic and tell us what you assumed."

### Judging
| Criterion | Weight |
|---|---|
| Demo works end to end | 30% |
| UX (resident, partner, property manager) | 25% |
| Feasibility & realism (data, consent/privacy, partner side) | 20% |
| Connector spec generic | 15% |
| Partner choice reasoning | 10% |

## Decisions we made
- **Use case: Move-in → Internet** (Jan opened his pitch with "Wi-Fi in a new flat"; the brief's example payloads are all for this case). Example: event 20 Nov, move-in 1 Dec, unit 4B, Musterstraße 12, 52062 Aachen, tenant Lena Hoffmann (c_202), owner Maria Becker (c_101).
- **Realism hook:** 20 Nov → 1 Dec is only 7 business days; fibre needs ~10. So we don't fake "live on day one": we order the real start date (4 Dec) and offer a free 5G router as a bridge. Most teams will miss this.
- **Second partner via manifest only** (electricity, `stadtwerk_energy`) on the same move-in event = live proof of the connector spec ("one event, several outcomes").
- **Channels:** ElevenLabs voice agent (outbound call via Twilio, also cross-track ElevenLabs prize) + tenant portal with one-click "Agree & order"; partner dashboard with signed webhooks; property-manager view with suggested next step and optional human approval.
- **AI only where language is.** State machine, eligibility, lead-time maths, consent, money, routing = plain code. LLM/voice only for talking to the tenant. Show a cost-per-case counter (~€0.30 AI vs ~€28 manual).
- **Workflow states (fixed, don't rename):** `detected → offer_sent → consent_given → ordered → confirmed → active → closed` + `declined`, `rejected`, `no_eligible_offer`.

## What already exists
- `lib/db/schema` (Liam): data model matching our ER diagram – portfolio (properties, buildings, units, parties, ownerships, leases, lease_parties, mandates, assets, meters), operations (cases, work_orders, documents, events), partners (partners, partner_offers, consents, service_orders), workflows (workflow_runs, conversations, messages, audit_events). Next.js 16, Supabase, RLS on.
- Partner Connect (Anis): ported from the standalone reference implementation onto `lib/db/schema` and merged into `main` – engine in `lib/workflow/`, connector spec in `lib/connectors/spec.ts`, demo pages in `app/(demo)/`. The reference app itself was removed after the port (it is still in git history before the commit that removed `reference/`). Its docs live in `docs/partner-connect/`: `connector-spec.md`, `assumptions.md`, `voice-agent-prompt.md`.

## The port (done)
1. Read `AGENTS.md` and `node_modules/next/dist/docs/` first (Next 16 differs from 15: params, caching, etc.).
2. Keep ONE data model: Liam's. Map reference tables to his; add only what's missing (likely: a written-back service contract or status on `service_orders`, partner manifest JSON on `partners`, cost/idempotency columns on `audit_events`). Generate migrations with `npm run db:generate -- --name=...`.
3. Follow Liam's conventions: decimals as strings (reference uses integer cents – convert), composite FKs, consent checked before every order, revocation keeps history, server-side DB access only.
4. Keep the reference's safety properties: atomic conditional state updates, `SELECT … FOR UPDATE` on partner webhooks, idempotent events/webhooks, a partner can only touch its own orders, consent only for fields the tenant was shown, HMAC webhook with timestamp, voice-tool secret + conversation-id check, data minimisation (partner gets only consented fields).
5. Port tests against the local Supabase Postgres, then the three demo pages (`/centrix`, `/portal/[partyId]`, `/partner`) using the repo's shadcn components.
6. Run typecheck, lint, tests, build before calling anything done. Small commits on `feat/partner-connect`.

## Known open points (say them in the pitch, don't build)
No auth on routes (demo). Production: partner API keys, signed portal links, property-manager key. Wohnungsgeberbestätigung and meter reading to the metering company are further connectors on the same event.

## Team split
- Anis: backend/code (this repo)
- Giacomo: connector spec doc, assumptions list, seed data realism
- Gabriele: pitch deck (3 min), voice agent prompt/copy, backup demo video

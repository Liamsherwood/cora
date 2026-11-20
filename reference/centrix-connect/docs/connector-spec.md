# centrix Partner Connector Spec v1

A partner plugs into centrix by shipping **one JSON manifest**. No code changes on the centrix side: the workflow engine reads triggers, eligibility, required data and the order channel from the manifest. The machine-readable source of truth is the Zod schema in `src/connectors/spec.ts`; this page explains it.

Live proof: `POST /api/partners/validate` checks a manifest, `POST /api/partners` registers it. The next matching centrix event creates a workflow for the new partner automatically.

## 1. Manifest

| Field | Meaning |
|---|---|
| `spec_version` | Always `"1.0"` |
| `id`, `name`, `legal_entity` | Stable id (`a-z0-9_`), display name, legal name shown to the resident |
| `category` | `internet`, `energy`, `insurance`, `repair`, `moving`, `heat_pump` |
| `triggers` | centrix moments the partner cares about: `tenant.move_in`, `tenant.move_out`, `contract.expiring`, `statement.annual_received`, `case.created` |
| `contact_window_days_before` | How early before the target date to reach the resident |
| `required_context` | The data the partner needs to fulfil an order. Exactly these fields are put in front of the resident for consent. Allowed: `name`, `email`, `phone`, `address`, `move_in_date`, `floor`, `unit_size_sqm`, `meter_number` |
| `purpose` | Plain-language purpose shown in the consent step |
| `offers[]` | Products (see below), in order of preference |
| `order.channel` | `webhook`, `email` or `dashboard` (+ `endpoint` for webhooks) |
| `status_updates` | Which statuses the partner will report; signed with HMAC-SHA256 |
| `sla.accept_within_hours` | Promise to accept/reject an order |
| `support_contact` | Escalation email |

### Offer

| Field | Meaning |
|---|---|
| `id`, `product`, `description` | Partner-scoped product id and texts |
| `monthly_price_cents`, `one_time_fee_cents`, `contract_months` | Price in integer cents |
| `lead_time_business_days` | Working days from order to activation. centrix compares this with the target date and decides when to contact the resident |
| `eligibility` | `postcode_prefixes` (required), optional `min_size_sqm`, `heating_types` |
| `bridge` (optional) | Stop-gap if activation can't happen in time (e.g. 5G router) with its own lead time |

## 2. Flow

```
centrix event ──► eligible offer computed from unit data ──► resident reached (voice / portal)
     ──► consent for exactly `required_context` ──► order with consented fields only
     ──► partner status webhooks ──► result written to the unit in centrix
```

Workflow states: `detected → offer_sent → consent_given → ordered → confirmed → active → closed`, plus `declined`, `rejected`, `no_eligible_offer`.

## 3. What the partner receives

Only the consented fields plus the order details (`product`, `offer_id`, `requested_start_date`, `bridge`). Never rent, owner data, other residents or internal ids. The exact payload is stored on the order for audit.

## 4. Status webhooks (partner → centrix)

`POST /api/partner/webhook/{partner_id}`

```json
{ "order_id": "ord_…", "status": "accepted", "event_id": "unique-per-delivery",
  "occurred_at": "2026-11-20T10:00:00Z", "activation_date": "2026-12-04", "note": "optional" }
```

- `status`: `accepted` | `scheduled` | `active` | `rejected` (only those declared in the manifest)
- Header `X-Centrix-Signature: t=<unix seconds>,v1=<hex>` where `v1 = HMAC_SHA256(secret, "<t>.<raw body>")`. Requests older than 5 minutes are rejected.
- `event_id` makes delivery idempotent: retries are safe.
- Out-of-order updates (e.g. `accepted` after `active`) are logged and ignored.
- A partner can only update its own orders.

Mapping: `accepted`/`scheduled` → contract `signed` on the unit; `active` → contract `active`, workflow `closed`; `rejected` → workflow `rejected`, property manager notified.

## 5. Adding the next partner

1. Write the manifest (see `data/partners/*.json`).
2. `POST /api/partners/validate` until it says `valid: true`.
3. `POST /api/partners` to register (or drop the file in `data/partners/` and reseed).
4. Done: the next matching event produces offers for it.

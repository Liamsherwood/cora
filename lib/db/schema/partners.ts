import { sql } from "drizzle-orm"
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { parties, units } from "./portfolio"
import { workflowRuns } from "./workflows"

export const partners = pgTable(
  "partners",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Stable id from the partner's connector manifest, e.g. "example_fibre". */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    regions: text("regions").array().default([]).notNull(),
    channels: text("channels").array().default([]).notNull(),
    /** The validated connector manifest (spec v1). The engine reads triggers, offers and required context from it. */
    manifest: jsonb("manifest").default({}).notNull(),
  },
  (table) => [unique("partners_slug_key").on(table.slug)]
).enableRLS()

export const partnerOffers = pgTable(
  "partner_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id),
    /** Offer id inside the partner's manifest, e.g. "fibre_250". */
    key: text("key").notNull(),
    product: text("product").notNull(),
    monthlyPriceEur: numeric("monthly_price_eur", { precision: 14, scale: 2 }),
    /** Working days from order to activation (weekends and public holidays excluded). */
    leadTimeBusinessDays: integer("lead_time_business_days"),
    eligibility: jsonb("eligibility").default({}).notNull(),
  },
  (table) => [
    unique("partner_offers_id_partner_key").on(table.id, table.partnerId),
    unique("partner_offers_partner_key_key").on(table.partnerId, table.key),
    index("partner_offers_partner_idx").on(table.partnerId),
    check(
      "partner_offers_lead_time_nonnegative",
      sql`${table.leadTimeBusinessDays} >= 0`
    ),
    check(
      "partner_offers_price_nonnegative",
      sql`${table.monthlyPriceEur} >= 0 AND ${table.monthlyPriceEur} <> 'NaN'::numeric`
    ),
  ]
).enableRLS()

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id),
    /** The workflow in which the tenant gave this consent (shown offer + fields). */
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id),
    dataShared: text("data_shared").array().notNull(),
    purpose: text("purpose"),
    channel: text("channel").notNull(),
    givenAt: timestamp("given_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("consents_id_party_partner_key").on(
      table.id,
      table.partyId,
      table.partnerId
    ),
    index("consents_party_partner_idx").on(table.partyId, table.partnerId),
    index("consents_partner_idx").on(table.partnerId),
    index("consents_workflow_run_idx").on(table.workflowRunId),
    check(
      "consents_dates_ordered",
      sql`${table.revokedAt} >= ${table.givenAt}`
    ),
  ]
).enableRLS()

export const SERVICE_ORDER_STATUSES = [
  "sent",
  "accepted",
  "scheduled",
  "active",
  "rejected",
] as const

/** The result written back to the unit once the partner confirms. */
export const CONTRACT_STATUSES = ["signed", "active", "cancelled"] as const

export const serviceOrders = pgTable(
  "service_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    offerId: uuid("offer_id").notNull(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    partnerId: uuid("partner_id").notNull(),
    consentId: uuid("consent_id").notNull(),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    /** Exactly what the partner received: only consented fields. */
    sharedPayload: jsonb("shared_payload").default({}).notNull(),
    startDate: date("start_date").notNull(),
    status: text("status").notNull(),
    // Contract written back to the unit (null until the partner confirms).
    contractStatus: text("contract_status"),
    monthlyPriceEur: numeric("monthly_price_eur", { precision: 14, scale: 2 }),
    /** Stop-gap product until the start date, e.g. { product: "5G router", until: "2026-12-04" }. */
    bridge: jsonb("bridge"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "service_orders_offer_partner_fk",
      columns: [table.offerId, table.partnerId],
      foreignColumns: [partnerOffers.id, partnerOffers.partnerId],
    }),
    foreignKey({
      name: "service_orders_consent_party_partner_fk",
      columns: [table.consentId, table.partyId, table.partnerId],
      foreignColumns: [consents.id, consents.partyId, consents.partnerId],
    }),
    // One order per workflow: a retried accept can never place a second order.
    unique("service_orders_workflow_run_key").on(table.workflowRunId),
    index("service_orders_offer_idx").on(table.offerId),
    index("service_orders_unit_idx").on(table.unitId),
    index("service_orders_party_idx").on(table.partyId),
    index("service_orders_partner_idx").on(table.partnerId),
    index("service_orders_consent_idx").on(table.consentId),
    check(
      "service_orders_status_known",
      sql`${table.status} IN ('sent', 'accepted', 'scheduled', 'active', 'rejected')`
    ),
    check(
      "service_orders_contract_status_known",
      sql`${table.contractStatus} IN ('signed', 'active', 'cancelled')`
    ),
    check(
      "service_orders_price_nonnegative",
      sql`${table.monthlyPriceEur} >= 0 AND ${table.monthlyPriceEur} <> 'NaN'::numeric`
    ),
  ]
).enableRLS()

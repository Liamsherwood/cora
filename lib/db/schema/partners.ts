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

export const partners = pgTable("partners", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  regions: text("regions").array().default([]).notNull(),
  channels: text("channels").array().default([]).notNull(),
}).enableRLS()

export const partnerOffers = pgTable(
  "partner_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id),
    product: text("product").notNull(),
    monthlyPriceEur: numeric("monthly_price_eur", { precision: 14, scale: 2 }),
    leadTimeDays: integer("lead_time_days"),
    eligibility: jsonb("eligibility").default({}).notNull(),
  },
  (table) => [
    unique("partner_offers_id_partner_key").on(table.id, table.partnerId),
    index("partner_offers_partner_idx").on(table.partnerId),
    check(
      "partner_offers_lead_time_nonnegative",
      sql`${table.leadTimeDays} >= 0`
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
    dataShared: text("data_shared").array().notNull(),
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
    check(
      "consents_dates_ordered",
      sql`${table.revokedAt} >= ${table.givenAt}`
    ),
  ]
).enableRLS()

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
    startDate: date("start_date").notNull(),
    status: text("status").notNull(),
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
    index("service_orders_offer_idx").on(table.offerId),
    index("service_orders_unit_idx").on(table.unitId),
    index("service_orders_party_idx").on(table.partyId),
    index("service_orders_consent_idx").on(table.consentId),
  ]
).enableRLS()

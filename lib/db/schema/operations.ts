import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { assets, parties, properties, units } from "./portfolio"

export const cases = pgTable(
  "cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    unitId: uuid("unit_id"),
    reporterPartyId: uuid("reporter_party_id").references(() => parties.id),
    assetId: uuid("asset_id"),
    category: text("category").notNull(),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
  },
  (table) => [
    foreignKey({
      name: "cases_unit_property_fk",
      columns: [table.unitId, table.propertyId],
      foreignColumns: [units.id, units.propertyId],
    }),
    foreignKey({
      name: "cases_asset_property_fk",
      columns: [table.assetId, table.propertyId],
      foreignColumns: [assets.id, assets.propertyId],
    }),
    index("cases_property_status_idx").on(table.propertyId, table.status),
    index("cases_unit_idx").on(table.unitId),
    index("cases_reporter_idx").on(table.reporterPartyId),
    index("cases_asset_idx").on(table.assetId),
  ]
).enableRLS()

export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    contractorId: uuid("contractor_id")
      .notNull()
      .references(() => parties.id),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    costEstimateEur: numeric("cost_estimate_eur", { precision: 14, scale: 2 }),
    payer: text("payer"),
    status: text("status").notNull(),
  },
  (table) => [
    index("work_orders_case_idx").on(table.caseId),
    index("work_orders_contractor_schedule_idx").on(
      table.contractorId,
      table.scheduledAt
    ),
    check(
      "work_orders_cost_nonnegative",
      sql`${table.costEstimateEur} >= 0 AND ${table.costEstimateEur} <> 'NaN'::numeric`
    ),
  ]
).enableRLS()

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    type: text("type").notNull(),
    url: text("url").notNull(),
  },
  (table) => [index("documents_case_idx").on(table.caseId)]
).enableRLS()

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").notNull(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    partyId: uuid("party_id").references(() => parties.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").default({}).notNull(),
  },
  (table) => [
    index("events_unit_occurred_idx").on(table.unitId, table.occurredAt),
    index("events_party_idx").on(table.partyId),
  ]
).enableRLS()

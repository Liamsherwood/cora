import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

export const properties = pgTable("properties", {
  id: uuid("id").defaultRandom().primaryKey(),
  address: text("address").notNull(),
  isWeg: boolean("is_weg").notNull(),
}).enableRLS()

export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    buildingYear: integer("building_year"),
    heatingType: text("heating_type"),
    energyClass: text("energy_class"),
  },
  (table) => [
    unique("buildings_id_property_key").on(table.id, table.propertyId),
    index("buildings_property_idx").on(table.propertyId),
  ]
).enableRLS()

export const units = pgTable(
  "units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buildingId: uuid("building_id").notNull(),
    propertyId: uuid("property_id").notNull(),
    identifier: text("identifier").notNull(),
    floor: integer("floor"),
    sizeSqm: integer("size_sqm"),
    rooms: integer("rooms"),
  },
  (table) => [
    foreignKey({
      name: "units_building_property_fk",
      columns: [table.buildingId, table.propertyId],
      foreignColumns: [buildings.id, buildings.propertyId],
    }),
    unique("units_id_building_key").on(table.id, table.buildingId),
    unique("units_id_property_key").on(table.id, table.propertyId),
    unique("units_building_identifier_key").on(
      table.buildingId,
      table.identifier
    ),
    check("units_size_positive", sql`${table.sizeSqm} > 0`),
    check("units_rooms_nonnegative", sql`${table.rooms} >= 0`),
  ]
).enableRLS()

export const parties = pgTable("parties", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  whatsappOptIn: boolean("whatsapp_opt_in").default(false).notNull(),
  language: text("language"),
}).enableRLS()

export const ownerships = pgTable(
  "ownerships",
  {
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    meaShare: numeric("mea_share", { precision: 18, scale: 8 }),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
  },
  (table) => [
    primaryKey({ columns: [table.unitId, table.partyId, table.validFrom] }),
    index("ownerships_party_idx").on(table.partyId),
    check(
      "ownerships_dates_ordered",
      sql`${table.validTo} >= ${table.validFrom}`
    ),
    check(
      "ownerships_share_nonnegative",
      sql`${table.meaShare} >= 0 AND ${table.meaShare} <> 'NaN'::numeric`
    ),
  ]
).enableRLS()

export const leases = pgTable(
  "leases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    rentColdEur: numeric("rent_cold_eur", {
      precision: 14,
      scale: 2,
    }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
  },
  (table) => [
    index("leases_unit_start_idx").on(table.unitId, table.startDate),
    check("leases_dates_ordered", sql`${table.endDate} >= ${table.startDate}`),
    check(
      "leases_rent_nonnegative",
      sql`${table.rentColdEur} >= 0 AND ${table.rentColdEur} <> 'NaN'::numeric`
    ),
  ]
).enableRLS()

export const leaseParties = pgTable(
  "lease_parties",
  {
    leaseId: uuid("lease_id")
      .notNull()
      .references(() => leases.id),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    role: text("role").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.leaseId, table.partyId, table.role] }),
    index("lease_parties_party_idx").on(table.partyId),
  ]
).enableRLS()

export const mandates = pgTable(
  "mandates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    type: text("type").notNull(),
    approvalLimitEur: numeric("approval_limit_eur", {
      precision: 14,
      scale: 2,
    }),
  },
  (table) => [
    index("mandates_property_idx").on(table.propertyId),
    index("mandates_party_idx").on(table.partyId),
    check(
      "mandates_limit_nonnegative",
      sql`${table.approvalLimitEur} >= 0 AND ${table.approvalLimitEur} <> 'NaN'::numeric`
    ),
  ]
).enableRLS()

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buildingId: uuid("building_id").notNull(),
    propertyId: uuid("property_id").notNull(),
    unitId: uuid("unit_id"),
    assetType: text("asset_type").notNull(),
    ownershipScope: text("ownership_scope").notNull(),
  },
  (table) => [
    foreignKey({
      name: "assets_building_property_fk",
      columns: [table.buildingId, table.propertyId],
      foreignColumns: [buildings.id, buildings.propertyId],
    }),
    foreignKey({
      name: "assets_unit_building_fk",
      columns: [table.unitId, table.buildingId],
      foreignColumns: [units.id, units.buildingId],
    }),
    unique("assets_id_property_key").on(table.id, table.propertyId),
    index("assets_building_idx").on(table.buildingId),
    index("assets_unit_idx").on(table.unitId),
  ]
).enableRLS()

export const meters = pgTable(
  "meters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    type: text("type").notNull(),
    number: text("number").notNull(),
  },
  (table) => [index("meters_unit_idx").on(table.unitId)]
).enableRLS()

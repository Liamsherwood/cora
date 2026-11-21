import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core"

import type { Trade } from "@/lib/tickets/playbook"
import { parties } from "./portfolio"

/**
 * What centrix knows about a contractor beyond the party record: which trades they
 * cover, where they are based and how far they travel, and whether they run a 24/7
 * emergency service. Matching a ticket to a contractor reads only this and the work
 * order history.
 */
export const contractorProfiles = pgTable(
  "contractor_profiles",
  {
    partyId: uuid("party_id")
      .primaryKey()
      .references(() => parties.id),
    trades: text("trades").array().$type<Trade[]>().notNull(),
    baseCity: text("base_city").notNull(),
    serviceRadiusKm: integer("service_radius_km").notNull(),
    emergencyService: boolean("emergency_service").default(false).notNull(),
  },
  (table) => [
    check(
      "contractor_profiles_trades_nonempty",
      sql`cardinality(${table.trades}) > 0`
    ),
    check(
      "contractor_profiles_radius_positive",
      sql`${table.serviceRadiusKm} > 0`
    ),
  ]
).enableRLS()

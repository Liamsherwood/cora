import { sql } from "drizzle-orm"
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import type { DispatchStep } from "@/lib/dispatch/steps"

import { cases, workOrders } from "./operations"
import { parties, properties } from "./portfolio"

/**
 * A maintenance request the property manager handed to Cora. Cora works through
 * `steps` one at a time (building records → contractor → slot → WhatsApp →
 * confirmation → work order) and writes the result back as a case and work order.
 */
export const maintenanceDispatches = pgTable(
  "maintenance_dispatches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** The dashboard request this dispatch handles; one dispatch per request. */
    requestKey: text("request_key").notNull().unique(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    priority: text("priority", {
      enum: ["Routine", "High", "Urgent"],
    }).notNull(),
    category: text("category").notNull(),
    status: text("status", {
      enum: ["working", "waiting", "done", "failed"],
    }).notNull(),
    steps: jsonb("steps").$type<DispatchStep[]>().notNull(),
    contractorId: uuid("contractor_id").references(() => parties.id),
    /** The number the WhatsApp message went to; a reply from it confirms or declines. */
    contractorPhone: text("contractor_phone"),
    slotStart: timestamp("slot_start", { withTimezone: true }),
    caseId: uuid("case_id").references(() => cases.id),
    workOrderId: uuid("work_order_id").references(() => workOrders.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("maintenance_dispatches_reply_idx")
      .on(table.contractorPhone)
      .where(sql`${table.status} = 'waiting'`),
    check(
      "maintenance_dispatches_status",
      sql`${table.status} IN ('working', 'waiting', 'done', 'failed')`
    ),
    check(
      "maintenance_dispatches_priority",
      sql`${table.priority} IN ('Routine', 'High', 'Urgent')`
    ),
  ]
).enableRLS()

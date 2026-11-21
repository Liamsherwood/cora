import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { cases } from "./operations"
import type { TicketClassification } from "@/lib/tickets/classification"

export const maintenanceTickets = pgTable(
  "maintenance_tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .unique()
      .references(() => cases.id),
    threadKey: text("thread_key").notNull(),
    summary: text("summary").notNull(),
    classification: jsonb("classification").$type<TicketClassification>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("maintenance_tickets_open_thread_idx")
      .on(table.threadKey)
      .where(sql`${table.resolvedAt} IS NULL`),
    index("maintenance_tickets_inbox_idx").on(table.updatedAt, table.id),
    check(
      "maintenance_tickets_summary_length",
      sql`length(${table.summary}) between 1 and 400`
    ),
  ]
).enableRLS()

export const ticketIntakes = pgTable("ticket_intakes", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").references(() => maintenanceTickets.id, {
    onDelete: "cascade",
  }),
  sendingReply: boolean("sending_reply").default(false).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true })
    .default(sql`now() + interval '60 seconds'`)
    .notNull(),
}).enableRLS()

export const ticketAgentRuns = pgTable(
  "ticket_agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => maintenanceTickets.id, { onDelete: "cascade" }),
    messageKey: text("message_key").notNull().unique(),
    agent: text("agent", { enum: ["cora-whatsapp", "cora-voice"] }).notNull(),
    model: text("model"),
    gatewayGenerationId: text("gateway_generation_id"),
    conversationId: text("conversation_id"),
    classification: jsonb("classification").$type<TicketClassification>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    ticketChange: text("ticket_change", {
      enum: ["opened", "updated", "none"],
    }).notNull(),
    replyType: text("reply_type", {
      enum: ["generated", "fallback"],
    }).notNull(),
    sendStatus: text("send_status", {
      enum: ["unconfirmed", "accepted", "failed", "returned"],
    })
      .notNull()
      .default("unconfirmed"),
  },
  (table) => [
    index("ticket_agent_runs_timeline_idx").on(
      table.ticketId,
      table.startedAt,
      table.id
    ),
    check(
      "ticket_agent_runs_ticket_change",
      sql`${table.ticketChange} IN ('opened', 'updated', 'none')`
    ),
    check(
      "ticket_agent_runs_reply_type",
      sql`${table.replyType} IN ('generated', 'fallback')`
    ),
    check(
      "ticket_agent_runs_send_status",
      sql`${table.sendStatus} IN ('unconfirmed', 'accepted', 'failed', 'returned')`
    ),
  ]
).enableRLS()

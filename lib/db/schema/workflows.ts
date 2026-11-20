import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { cases, events } from "./operations"
import { parties } from "./portfolio"

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    caseId: uuid("case_id").references(() => cases.id),
    state: text("state").notNull(),
    steps: jsonb("steps").default([]).notNull(),
  },
  (table) => [
    index("workflow_runs_event_idx").on(table.eventId),
    index("workflow_runs_case_idx").on(table.caseId),
  ]
).enableRLS()

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    channel: text("channel").notNull(),
    participants: text("participants").array().default([]).notNull(),
    externalThreadId: text("external_thread_id"),
  },
  (table) => [index("conversations_workflow_run_idx").on(table.workflowRunId)]
).enableRLS()

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    senderPartyId: uuid("sender_party_id").references(() => parties.id),
    content: text("content").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("messages_conversation_sent_idx").on(
      table.conversationId,
      table.sentAt
    ),
    index("messages_sender_idx").on(table.senderPartyId),
  ]
).enableRLS()

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    type: text("type").notNull(),
    details: jsonb("details").default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("audit_events_workflow_occurred_idx").on(
      table.workflowRunId,
      table.occurredAt
    ),
  ]
).enableRLS()

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
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { cases, events } from "./operations"
import { partnerOffers, partners } from "./partners"
import { parties } from "./portfolio"
import { WORKFLOW_STATES } from "../../workflow/state-names"

export { WORKFLOW_STATES }

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    caseId: uuid("case_id").references(() => cases.id),
    partnerId: uuid("partner_id").references(() => partners.id),
    offerId: uuid("offer_id"),
    state: text("state").notNull(),
    steps: jsonb("steps").default([]).notNull(),
    /** Snapshot of the computed offer (price, start date, bridge, fields) shown to the tenant. */
    offer: jsonb("offer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "workflow_runs_offer_partner_fk",
      columns: [table.offerId, table.partnerId],
      foreignColumns: [partnerOffers.id, partnerOffers.partnerId],
    }),
    // One run per (event, partner): a re-delivered event must not start a second flow.
    unique("workflow_runs_event_partner_key").on(
      table.eventId,
      table.partnerId
    ),
    index("workflow_runs_event_idx").on(table.eventId),
    index("workflow_runs_case_idx").on(table.caseId),
    index("workflow_runs_partner_idx").on(table.partnerId),
    check(
      "workflow_runs_state_known",
      sql`${table.state} IN ('detected', 'offer_sent', 'consent_given', 'ordered', 'confirmed', 'active', 'closed', 'no_eligible_offer', 'declined', 'rejected')`
    ),
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
    /** agent | tenant | system | partner */
    role: text("role").default("system").notNull(),
    content: text("content").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("messages_conversation_sent_idx").on(
      table.conversationId,
      table.sentAt
    ),
    index("messages_sender_idx").on(table.senderPartyId),
    check(
      "messages_role_known",
      sql`${table.role} IN ('agent', 'tenant', 'system', 'partner')`
    ),
  ]
).enableRLS()

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    /** state_change | proposal | execution | message | error | partner_update | ... */
    type: text("type").notNull(),
    /** system | ai | tenant | partner | property_manager */
    actor: text("actor").default("system").notNull(),
    fromState: text("from_state"),
    toState: text("to_state"),
    details: jsonb("details").default({}).notNull(),
    /** AI/telephony cost attributed to this step (cost-per-case counter). */
    costEur: numeric("cost_eur", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),
    /** Set for partner webhook deliveries; a replay with the same key is ignored. */
    idempotencyKey: text("idempotency_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("audit_events_workflow_occurred_idx").on(
      table.workflowRunId,
      table.occurredAt
    ),
    unique("audit_events_idempotency_key").on(table.idempotencyKey),
    check(
      "audit_events_cost_nonnegative",
      sql`${table.costEur} >= 0 AND ${table.costEur} <> 'NaN'::numeric`
    ),
  ]
).enableRLS()

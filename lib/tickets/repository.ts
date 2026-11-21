import "server-only"

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import type { DB, Exec, Tx } from "@/lib/db"
import { cases, events, workOrders } from "@/lib/db/schema/operations"
import { parties, properties, units } from "@/lib/db/schema/portfolio"
import {
  maintenanceTickets,
  ticketAgentRuns,
  ticketIntakes,
} from "@/lib/db/schema/tickets"
import type { TicketClassification } from "./classification"
import { mergeDetails, ticketTitle, type TicketDetails } from "./details"
import { findTicketTenancy, matchWhatsAppTenancy } from "./tenancies"

export type TicketReport = {
  kind: "report" | "follow_up"
  /** Short inbox title; tidied and clipped on save. */
  title?: string | null
  summary: string
  classification?: TicketClassification
  /** Merged into what the ticket already knows; empty values never erase a fact. */
  details?: TicketDetails | null
}

type AgentRun = Pick<
  typeof ticketAgentRuns.$inferInsert,
  | "messageKey"
  | "agent"
  | "model"
  | "gatewayGenerationId"
  | "conversationId"
  | "startedAt"
  | "replyType"
> & {
  threadKey: string
  report: TicketReport | null
} & (
    | { senderPhone?: string; createVoiceCase?: never }
    | { senderPhone?: never; createVoiceCase: (tx: Tx) => Promise<string> }
  )

async function createMaintenanceCase(
  db: Exec,
  tenancy: { partyId: string; unitId: string; propertyId: string },
  status: "open" | "resolved",
  classification?: TicketClassification | null
) {
  const [created] = await db
    .insert(cases)
    .values({
      reporterPartyId: tenancy.partyId,
      unitId: tenancy.unitId,
      propertyId: tenancy.propertyId,
      category: classification?.category ?? "maintenance",
      priority: classification?.priority ?? "routine",
      status,
    })
    .returning({ id: cases.id })
  return created.id
}

export function saveTicketRun(
  db: DB,
  { threadKey, report, senderPhone, createVoiceCase, ...run }: AgentRun,
  intakeId?: string | null
) {
  if (!report && run.replyType === "generated") return Promise.resolve(null)

  return db.transaction(async (tx) => {
    // Serialize intake for this conversation, including when there is no ticket to lock yet.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${threadKey}, 0))`
    )

    const [recorded] = await tx
      .select({
        id: ticketAgentRuns.id,
        ticketId: ticketAgentRuns.ticketId,
        caseId: maintenanceTickets.caseId,
      })
      .from(ticketAgentRuns)
      .innerJoin(
        maintenanceTickets,
        eq(maintenanceTickets.id, ticketAgentRuns.ticketId)
      )
      .where(eq(ticketAgentRuns.messageKey, run.messageKey))
    if (recorded) return { ...recorded, replayed: true }

    const [open] = await tx
      .select({
        id: maintenanceTickets.id,
        caseId: maintenanceTickets.caseId,
        title: maintenanceTickets.title,
        summary: maintenanceTickets.summary,
        classification: maintenanceTickets.classification,
        details: maintenanceTickets.details,
      })
      .from(maintenanceTickets)
      .where(
        and(
          eq(maintenanceTickets.threadKey, threadKey),
          isNull(maintenanceTickets.resolvedAt)
        )
      )
      .for("update")

    if (!open && report?.kind !== "report") return null

    const tenancy =
      report && senderPhone && !open?.caseId
        ? await matchWhatsAppTenancy(tx, senderPhone, run.startedAt)
        : null
    const classification = report?.classification
    const title = ticketTitle(report?.title)
    const caseId =
      open?.caseId ??
      (createVoiceCase
        ? await createVoiceCase(tx)
        : tenancy
          ? await createMaintenanceCase(tx, tenancy, "open", classification)
          : null)
    let ticketId: string
    let ticketChange: typeof ticketAgentRuns.$inferInsert.ticketChange = "none"
    if (!open) {
      if (report?.kind !== "report") return null

      const [created] = await tx
        .insert(maintenanceTickets)
        .values({
          threadKey,
          caseId,
          title,
          summary: report.summary,
          classification,
          details: mergeDetails(null, report.details),
        })
        .returning({ id: maintenanceTickets.id })
      ticketId = created.id
      ticketChange = "opened"
    } else {
      ticketId = open.id
      const classificationChanged =
        classification &&
        (classification.category !== open.classification?.category ||
          classification.priority !== open.classification?.priority ||
          classification.scope !== open.classification?.scope)
      const details = mergeDetails(open.details, report?.details)
      if (
        report &&
        (caseId !== open.caseId ||
          report.summary !== open.summary ||
          classificationChanged ||
          (title !== null && title !== open.title) ||
          JSON.stringify(details) !== JSON.stringify(open.details ?? null))
      ) {
        await tx
          .update(maintenanceTickets)
          .set({
            caseId,
            title: title ?? open.title,
            summary: report.summary,
            classification,
            details,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(eq(maintenanceTickets.id, ticketId))
        ticketChange = "updated"
      }
      if (classificationChanged && classification && open.caseId) {
        await tx
          .update(cases)
          .set({
            category: classification.category,
            priority: classification.priority,
          })
          .where(eq(cases.id, open.caseId))
      }
    }

    const [recordedRun] = await tx
      .insert(ticketAgentRuns)
      .values({
        ...run,
        ticketId,
        ticketChange,
        classification,
        sendStatus: createVoiceCase ? "returned" : "unconfirmed",
      })
      .returning({ id: ticketAgentRuns.id })
    if (intakeId) {
      await tx
        .update(ticketIntakes)
        .set({ ticketId, sendingReply: true })
        .where(eq(ticketIntakes.id, intakeId))
    }
    return { id: recordedRun.id, ticketId, caseId, replayed: false }
  })
}

export async function setTicketRunSendStatus(
  db: Exec,
  runId: string,
  sendStatus: "accepted" | "failed"
) {
  await db
    .update(ticketAgentRuns)
    .set({ sendStatus })
    .where(
      and(
        eq(ticketAgentRuns.id, runId),
        eq(ticketAgentRuns.sendStatus, "unconfirmed")
      )
    )
}

const ticketFields = {
  id: maintenanceTickets.id,
  caseId: maintenanceTickets.caseId,
  title: maintenanceTickets.title,
  summary: maintenanceTickets.summary,
  classification: maintenanceTickets.classification,
  details: maintenanceTickets.details,
  createdAt: maintenanceTickets.createdAt,
  updatedAt: maintenanceTickets.updatedAt,
  resolvedAt: maintenanceTickets.resolvedAt,
  tenantName: parties.name,
  propertyAddress: properties.address,
  propertyCity: properties.city,
  unitIdentifier: units.identifier,
}

export const ticketPageSize = 25

function ticketsWithCase(db: Exec) {
  return db
    .select(ticketFields)
    .from(maintenanceTickets)
    .leftJoin(cases, eq(cases.id, maintenanceTickets.caseId))
    .leftJoin(parties, eq(parties.id, cases.reporterPartyId))
    .leftJoin(properties, eq(properties.id, cases.propertyId))
    .leftJoin(units, eq(units.id, cases.unitId))
}

export function listTickets(db: Exec, page: number) {
  return ticketsWithCase(db)
    .orderBy(desc(maintenanceTickets.updatedAt), desc(maintenanceTickets.id))
    .offset((page - 1) * ticketPageSize)
    .limit(ticketPageSize + 1)
}

export async function getTicket(db: Exec, id: string) {
  const [ticket] = await ticketsWithCase(db).where(
    eq(maintenanceTickets.id, id)
  )
  return ticket ?? null
}

export function listTicketRuns(db: Exec, ticketId: string) {
  return db
    .select({
      id: ticketAgentRuns.id,
      agent: ticketAgentRuns.agent,
      classification: ticketAgentRuns.classification,
      startedAt: ticketAgentRuns.startedAt,
      ticketChange: ticketAgentRuns.ticketChange,
      replyType: ticketAgentRuns.replyType,
      sendStatus: ticketAgentRuns.sendStatus,
      model: ticketAgentRuns.model,
      gatewayGenerationId: ticketAgentRuns.gatewayGenerationId,
      conversationId: ticketAgentRuns.conversationId,
    })
    .from(ticketAgentRuns)
    .where(eq(ticketAgentRuns.ticketId, ticketId))
    .orderBy(asc(ticketAgentRuns.startedAt), asc(ticketAgentRuns.id))
}

export function listRecentTicketRuns(db: Exec, limit: number) {
  return db
    .select({
      id: ticketAgentRuns.id,
      ticketId: ticketAgentRuns.ticketId,
      agent: ticketAgentRuns.agent,
      startedAt: ticketAgentRuns.startedAt,
      ticketChange: ticketAgentRuns.ticketChange,
      sendStatus: ticketAgentRuns.sendStatus,
    })
    .from(ticketAgentRuns)
    .orderBy(desc(ticketAgentRuns.startedAt), desc(ticketAgentRuns.id))
    .limit(limit)
}

export type TicketCall = {
  conversationId: string
  summary: string
  successful: boolean | null
  durationSecs: number | null
  endedAt: Date
}

/**
 * The finished calls behind a ticket: ElevenLabs' post-call webhook stores each one as a
 * `call.completed` event keyed by conversation ID (see /api/voice/webhooks/post-call).
 */
export async function listTicketCalls(
  db: Exec,
  conversationIds: string[]
): Promise<TicketCall[]> {
  if (!conversationIds.length) return []
  const rows = await db
    .select({ payload: events.payload, occurredAt: events.occurredAt })
    .from(events)
    .where(
      and(
        eq(events.type, "call.completed"),
        inArray(
          sql<string>`${events.payload}->>'conversation_id'`,
          conversationIds
        )
      )
    )
    .orderBy(asc(events.occurredAt))
  return rows.map(({ payload, occurredAt }) => {
    const call = payload as {
      conversation_id: string
      summary?: string
      call_successful?: string | null
      duration_secs?: number | null
    }
    return {
      conversationId: call.conversation_id,
      summary: call.summary ?? "",
      successful:
        call.call_successful === "success"
          ? true
          : call.call_successful === "failure"
            ? false
            : null,
      durationSecs:
        typeof call.duration_secs === "number" ? call.duration_secs : null,
      endedAt: occurredAt,
    }
  })
}

export function linkTicketToTenancy(
  db: DB,
  id: string,
  partyId: string,
  unitId: string
) {
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .select({
        caseId: maintenanceTickets.caseId,
        resolvedAt: maintenanceTickets.resolvedAt,
        classification: maintenanceTickets.classification,
      })
      .from(maintenanceTickets)
      .where(eq(maintenanceTickets.id, id))
      .for("update")
    if (!ticket || ticket.caseId) return false

    const tenancy = await findTicketTenancy(tx, partyId, unitId)
    if (!tenancy) return false

    const caseId = await createMaintenanceCase(
      tx,
      tenancy,
      ticket.resolvedAt ? "resolved" : "open",
      ticket.classification
    )
    await tx
      .update(maintenanceTickets)
      .set({ caseId, updatedAt: sql`now()` })
      .where(eq(maintenanceTickets.id, id))
    return true
  })
}

export function resolveTicket(db: DB, id: string) {
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .update(maintenanceTickets)
      .set({ resolvedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(maintenanceTickets.id, id),
          isNull(maintenanceTickets.resolvedAt)
        )
      )
      .returning({ caseId: maintenanceTickets.caseId })

    if (ticket?.caseId) {
      await tx
        .update(cases)
        .set({ status: "resolved" })
        .where(eq(cases.id, ticket.caseId))
      // The repair is done: free the contractor's slot.
      await tx
        .update(workOrders)
        .set({ status: "completed" })
        .where(
          and(
            eq(workOrders.caseId, ticket.caseId),
            inArray(workOrders.status, [
              "requested",
              "accepted",
              "scheduled",
              "in_progress",
            ])
          )
        )
    }
  })
}

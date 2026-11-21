import "server-only"

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm"

import type { DB, Exec, Tx } from "@/lib/db"
import { cases } from "@/lib/db/schema/operations"
import { parties, properties, units } from "@/lib/db/schema/portfolio"
import {
  maintenanceTickets,
  ticketAgentRuns,
  ticketIntakes,
} from "@/lib/db/schema/tickets"
import type { TicketClassification } from "./classification"
import { findTicketTenancy, matchWhatsAppTenancy } from "./tenancies"

export type TicketReport = {
  kind: "report" | "follow_up"
  summary: string
  classification?: TicketClassification
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
        summary: maintenanceTickets.summary,
        classification: maintenanceTickets.classification,
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
        .values({ threadKey, caseId, summary: report.summary, classification })
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
      if (
        report &&
        (caseId !== open.caseId ||
          report.summary !== open.summary ||
          classificationChanged)
      ) {
        await tx
          .update(maintenanceTickets)
          .set({
            caseId,
            summary: report.summary,
            classification,
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

const publicTicketFields = {
  id: maintenanceTickets.id,
  caseId: maintenanceTickets.caseId,
  classification: maintenanceTickets.classification,
  createdAt: maintenanceTickets.createdAt,
  updatedAt: maintenanceTickets.updatedAt,
  resolvedAt: maintenanceTickets.resolvedAt,
}

const ticketFields = {
  ...publicTicketFields,
  summary: maintenanceTickets.summary,
  tenantName: parties.name,
  propertyAddress: properties.address,
  unitIdentifier: units.identifier,
}

export const ticketPageSize = 25

export function listPublicTickets(db: Exec, page: number) {
  return db
    .select(publicTicketFields)
    .from(maintenanceTickets)
    .orderBy(desc(maintenanceTickets.updatedAt), desc(maintenanceTickets.id))
    .offset((page - 1) * ticketPageSize)
    .limit(ticketPageSize + 1)
}

export async function getPublicTicket(db: Exec, id: string) {
  const [ticket] = await db
    .select(publicTicketFields)
    .from(maintenanceTickets)
    .where(eq(maintenanceTickets.id, id))
  return ticket ?? null
}

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

const publicRunFields = {
  id: ticketAgentRuns.id,
  agent: ticketAgentRuns.agent,
  classification: ticketAgentRuns.classification,
  startedAt: ticketAgentRuns.startedAt,
  ticketChange: ticketAgentRuns.ticketChange,
  replyType: ticketAgentRuns.replyType,
  sendStatus: ticketAgentRuns.sendStatus,
}

export function listPublicTicketRuns(db: Exec, ticketId: string) {
  return db
    .select(publicRunFields)
    .from(ticketAgentRuns)
    .where(eq(ticketAgentRuns.ticketId, ticketId))
    .orderBy(asc(ticketAgentRuns.startedAt), asc(ticketAgentRuns.id))
}

export function listTicketRuns(db: Exec, ticketId: string) {
  return db
    .select({
      ...publicRunFields,
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
    }
  })
}

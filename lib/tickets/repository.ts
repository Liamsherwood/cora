import "server-only"

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm"

import type { DB, Exec } from "@/lib/db"
import { cases } from "@/lib/db/schema/operations"
import { parties, properties, units } from "@/lib/db/schema/portfolio"
import {
  maintenanceTickets,
  ticketAgentRuns,
  ticketIntakes,
} from "@/lib/db/schema/tickets"
import { findTicketTenancy, matchWhatsAppTenancy } from "./tenancies"

export type TicketReport = { kind: "report" | "follow_up"; summary: string }

type AgentRun = Pick<
  typeof ticketAgentRuns.$inferInsert,
  | "messageKey"
  | "agent"
  | "model"
  | "gatewayGenerationId"
  | "startedAt"
  | "replyType"
> & {
  threadKey: string
  report: TicketReport | null
  senderPhone?: string
}

async function createMaintenanceCase(
  db: Exec,
  tenancy: { partyId: string; unitId: string; propertyId: string },
  status: "open" | "resolved" = "open"
) {
  const [created] = await db
    .insert(cases)
    .values({
      reporterPartyId: tenancy.partyId,
      unitId: tenancy.unitId,
      propertyId: tenancy.propertyId,
      category: "maintenance",
      priority: "routine",
      status,
    })
    .returning({ id: cases.id })
  return created.id
}

export function recordTicketRun(
  db: DB,
  { threadKey, report, senderPhone, ...run }: AgentRun,
  intakeId?: string | null
) {
  if (!report && run.replyType === "generated") return Promise.resolve(null)

  return db.transaction(async (tx) => {
    // Serialize intake for this conversation, including when there is no ticket to lock yet.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${threadKey}, 0))`
    )

    const [recorded] = await tx
      .select({ id: ticketAgentRuns.id })
      .from(ticketAgentRuns)
      .where(eq(ticketAgentRuns.messageKey, run.messageKey))
    if (recorded) return null

    const [open] = await tx
      .select({
        id: maintenanceTickets.id,
        caseId: maintenanceTickets.caseId,
        summary: maintenanceTickets.summary,
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
    const caseId = tenancy
      ? await createMaintenanceCase(tx, tenancy)
      : undefined
    let ticketId: string
    let ticketChange: typeof ticketAgentRuns.$inferInsert.ticketChange = "none"
    if (!open) {
      if (report?.kind !== "report") return null

      const [created] = await tx
        .insert(maintenanceTickets)
        .values({ threadKey, caseId, summary: report.summary })
        .returning({ id: maintenanceTickets.id })
      ticketId = created.id
      ticketChange = "opened"
    } else {
      ticketId = open.id
      if (report && (caseId || report.summary !== open.summary)) {
        await tx
          .update(maintenanceTickets)
          .set({
            caseId,
            summary: report.summary,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(eq(maintenanceTickets.id, ticketId))
        ticketChange = "updated"
      }
    }

    const [recordedRun] = await tx
      .insert(ticketAgentRuns)
      .values({ ...run, ticketId, ticketChange })
      .returning({ id: ticketAgentRuns.id })
    if (intakeId) {
      await tx
        .update(ticketIntakes)
        .set({ ticketId, sendingReply: true })
        .where(eq(ticketIntakes.id, intakeId))
    }
    return recordedRun.id
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
  summary: maintenanceTickets.summary,
  createdAt: maintenanceTickets.createdAt,
  updatedAt: maintenanceTickets.updatedAt,
  resolvedAt: maintenanceTickets.resolvedAt,
  tenantName: parties.name,
  propertyAddress: properties.address,
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
      model: ticketAgentRuns.model,
      gatewayGenerationId: ticketAgentRuns.gatewayGenerationId,
      startedAt: ticketAgentRuns.startedAt,
      ticketChange: ticketAgentRuns.ticketChange,
      replyType: ticketAgentRuns.replyType,
      sendStatus: ticketAgentRuns.sendStatus,
    })
    .from(ticketAgentRuns)
    .where(eq(ticketAgentRuns.ticketId, ticketId))
    .orderBy(asc(ticketAgentRuns.startedAt), asc(ticketAgentRuns.id))
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
      ticket.resolvedAt ? "resolved" : "open"
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

import "server-only"

import {
  and,
  arrayContains,
  desc,
  eq,
  gte,
  inArray,
  notInArray,
  sql,
} from "drizzle-orm"

import type { DB, Exec } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { AppError, notFound, unprocessable } from "@/lib/errors"
import { isUuid, newId } from "@/lib/ids"
import type { TicketClassification } from "@/lib/tickets/classification"
import { tradeFor, type Trade } from "@/lib/tickets/playbook"
import { clock } from "@/lib/time"

import { distanceKm } from "./geo"
import { proposeVisit } from "./slots"

/**
 * Finding and booking a contractor for a ticket. Deterministic: candidates are the
 * contractors whose profile covers the ticket's trade; they are ranked by whether the
 * building is inside their service area, 24/7 cover for emergencies, how often they
 * have worked in this building, distance and current workload. No model is involved.
 */

const ACTIVE = ["requested", "accepted", "scheduled", "in_progress"]
const FINISHED_OR_CANCELLED = ["completed", "invoiced", "cancelled"]
export const SHORTLIST = 3

export type Candidate = {
  partyId: string
  name: string
  phone: string | null
  baseCity: string
  distanceKm: number | null
  inArea: boolean
  emergencyService: boolean
  /** Earlier jobs in this building, the strongest sign they know it. */
  jobsHere: number
  openJobs: number
}

export function rankCandidates(
  candidates: Candidate[],
  priority: TicketClassification["priority"]
): Candidate[] {
  const emergency = priority === "emergency"
  return [...candidates].sort(
    (a, b) =>
      Number(b.inArea) - Number(a.inArea) ||
      (emergency
        ? Number(b.emergencyService) - Number(a.emergencyService)
        : 0) ||
      b.jobsHere - a.jobsHere ||
      (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
      a.openJobs - b.openJobs ||
      a.name.localeCompare(b.name, "de")
  )
}

type TicketContext = {
  ticketId: string
  caseId: string
  unitId: string | null
  propertyId: string
  city: string
  trade: Trade
  priority: TicketClassification["priority"]
}

async function ticketContext(
  db: Exec,
  ticketId: string,
  lock = false
): Promise<TicketContext> {
  if (!isUuid(ticketId)) throw notFound("ticket")
  const query = db
    .select({
      caseId: t.maintenanceTickets.caseId,
      resolvedAt: t.maintenanceTickets.resolvedAt,
      classification: t.maintenanceTickets.classification,
    })
    .from(t.maintenanceTickets)
    .where(eq(t.maintenanceTickets.id, ticketId))
  const [ticket] = lock ? await query.for("update") : await query
  if (!ticket) throw notFound("ticket")
  if (ticket.resolvedAt) throw unprocessable("the ticket is already resolved")
  if (!ticket.caseId)
    throw unprocessable("link the ticket to a tenancy before booking")
  if (!ticket.classification)
    throw unprocessable("set a category before booking")
  const trade = tradeFor[ticket.classification.category]
  if (!trade) throw unprocessable("this category needs no contractor")
  const [place] = await db
    .select({
      unitId: t.cases.unitId,
      propertyId: t.cases.propertyId,
      city: t.properties.city,
    })
    .from(t.cases)
    .innerJoin(t.properties, eq(t.properties.id, t.cases.propertyId))
    .where(eq(t.cases.id, ticket.caseId))
  if (!place) throw notFound("case")
  return {
    ticketId,
    caseId: ticket.caseId,
    ...place,
    // Unknown towns still get a shortlist, ranked without distance.
    city: place.city ?? "",
    trade,
    priority: ticket.classification.priority,
  }
}

/** Contractors' booked visits from `from` on, to keep proposed slots clear of them. */
async function bookedVisits(db: Exec, partyIds: string[], from: Date) {
  const booked = new Map<string, Date[]>()
  if (!partyIds.length) return booked
  const rows = await db
    .select({
      contractorId: t.workOrders.contractorId,
      at: t.workOrders.scheduledAt,
    })
    .from(t.workOrders)
    .where(
      and(
        inArray(t.workOrders.contractorId, partyIds),
        inArray(t.workOrders.status, ACTIVE),
        gte(t.workOrders.scheduledAt, from)
      )
    )
  for (const row of rows)
    if (row.at)
      booked.set(row.contractorId, [
        ...(booked.get(row.contractorId) ?? []),
        row.at,
      ])
  return booked
}

async function candidatesFor(
  db: Exec,
  context: TicketContext,
  contractorId?: string
): Promise<Candidate[]> {
  const rows = await db
    .select({
      partyId: t.parties.id,
      name: t.parties.name,
      phone: t.parties.phone,
      baseCity: t.contractorProfiles.baseCity,
      radius: t.contractorProfiles.serviceRadiusKm,
      emergencyService: t.contractorProfiles.emergencyService,
      jobsHere: sql<number>`count(*) filter (where ${t.cases.propertyId} = ${context.propertyId} and ${t.workOrders.status} <> 'cancelled')::int`,
      openJobs: sql<number>`count(*) filter (where ${inArray(t.workOrders.status, ACTIVE)})::int`,
    })
    .from(t.contractorProfiles)
    .innerJoin(t.parties, eq(t.parties.id, t.contractorProfiles.partyId))
    .leftJoin(t.workOrders, eq(t.workOrders.contractorId, t.parties.id))
    .leftJoin(t.cases, eq(t.cases.id, t.workOrders.caseId))
    .where(
      and(
        arrayContains(t.contractorProfiles.trades, [context.trade]),
        contractorId ? eq(t.parties.id, contractorId) : undefined
      )
    )
    .groupBy(t.parties.id, t.contractorProfiles.partyId)
  return rows.map(({ radius, ...row }) => {
    const distance = distanceKm(row.baseCity, context.city)
    return {
      ...row,
      distanceKm: distance,
      inArea: distance !== null && distance <= radius,
    }
  })
}

export type ContractorSearch = {
  trade: Trade
  city: string
  priority: TicketClassification["priority"]
  /** Contractors with the trade on file, and how many cover the building. */
  searched: number
  inArea: number
  shortlist: (Candidate & { visit: string })[]
}

export async function findContractors(
  db: Exec,
  ticketId: string,
  at: Date
): Promise<ContractorSearch> {
  const context = await ticketContext(db, ticketId)
  const candidates = await candidatesFor(db, context)
  const ranked = rankCandidates(candidates, context.priority).slice(
    0,
    SHORTLIST
  )
  const booked = await bookedVisits(
    db,
    ranked.map((c) => c.partyId),
    at
  )
  return {
    trade: context.trade,
    city: context.city,
    priority: context.priority,
    searched: candidates.length,
    inArea: candidates.filter((c) => c.inArea).length,
    shortlist: ranked.map((c) => ({
      ...c,
      visit: proposeVisit(
        context.priority,
        at,
        booked.get(c.partyId)
      ).toISOString(),
    })),
  }
}

export type BookedVisit = {
  workOrderId: string
  contractorId: string
  contractorName: string
  contractorPhone: string | null
  baseCity: string | null
  scheduledAt: Date | null
  status: string
}

/** The case's current contractor job, if any (cancelled ones don't count). */
export async function activeWorkOrder(
  db: Exec,
  caseId: string
): Promise<BookedVisit | null> {
  const [row] = await db
    .select({
      workOrderId: t.workOrders.id,
      contractorId: t.workOrders.contractorId,
      contractorName: t.parties.name,
      contractorPhone: t.parties.phone,
      baseCity: t.contractorProfiles.baseCity,
      scheduledAt: t.workOrders.scheduledAt,
      status: t.workOrders.status,
    })
    .from(t.workOrders)
    .innerJoin(t.parties, eq(t.parties.id, t.workOrders.contractorId))
    .leftJoin(
      t.contractorProfiles,
      eq(t.contractorProfiles.partyId, t.workOrders.contractorId)
    )
    .where(
      and(
        eq(t.workOrders.caseId, caseId),
        notInArray(t.workOrders.status, ["cancelled"])
      )
    )
    .orderBy(desc(t.workOrders.scheduledAt))
    .limit(1)
  return row ?? null
}

/**
 * Books the contractor for the ticket's case: one work order with the first free visit,
 * the case moved to "scheduled" and a `work_order.scheduled` event for the unit's
 * history. The ticket row is locked, so a double click books once; booking again while
 * a job is open returns that job. The contractor's confirmation is simulated.
 */
export function commissionContractor(
  db: DB,
  ticketId: string,
  contractorId: string,
  at: Date
): Promise<BookedVisit & { replayed: boolean }> {
  return db.transaction(async (tx) => {
    const context = await ticketContext(tx, ticketId, true)
    const [open] = await tx
      .select({ id: t.workOrders.id })
      .from(t.workOrders)
      .where(
        and(
          eq(t.workOrders.caseId, context.caseId),
          notInArray(t.workOrders.status, FINISHED_OR_CANCELLED)
        )
      )
      .limit(1)
    if (open) {
      const current = await activeWorkOrder(tx, context.caseId)
      return { ...current!, replayed: true }
    }
    if (!isUuid(contractorId)) throw notFound("contractor")
    const [contractor] = await candidatesFor(tx, context, contractorId)
    if (!contractor)
      throw new AppError(
        `that contractor doesn't cover this trade (${context.trade})`,
        422,
        "unprocessable"
      )
    const booked = await bookedVisits(tx, [contractorId], at)
    const visit = proposeVisit(context.priority, at, booked.get(contractorId))

    const workOrderId = newId()
    await tx.insert(t.workOrders).values({
      id: workOrderId,
      caseId: context.caseId,
      contractorId,
      scheduledAt: visit,
      status: "scheduled",
    })
    await tx
      .update(t.cases)
      .set({ status: "scheduled" })
      .where(
        and(
          eq(t.cases.id, context.caseId),
          inArray(t.cases.status, ["open", "triaged"])
        )
      )
    await tx
      .update(t.maintenanceTickets)
      .set({ updatedAt: sql`clock_timestamp()` })
      .where(eq(t.maintenanceTickets.id, ticketId))

    // Shared-area cases have no unit; their history lives on the reporter's unit.
    const unitId =
      context.unitId ??
      (
        await tx
          .select({ unitId: t.events.unitId })
          .from(t.events)
          .where(
            and(
              eq(t.events.type, "case.created"),
              sql`${t.events.payload}->>'case_id' = ${context.caseId}`
            )
          )
          .limit(1)
      )[0]?.unitId
    if (unitId) {
      await tx.insert(t.events).values({
        id: newId(),
        type: "work_order.scheduled",
        unitId,
        occurredAt: clock(),
        payload: {
          case_id: context.caseId,
          work_order_id: workOrderId,
          contractor_id: contractorId,
          contractor_name: contractor.name,
          trade: context.trade,
          scheduled_at: visit.toISOString(),
          confirmation: "simulated",
        },
      })
    }
    return {
      workOrderId,
      contractorId,
      contractorName: contractor.name,
      contractorPhone: contractor.phone,
      baseCity: contractor.baseCity,
      scheduledAt: visit,
      status: "scheduled",
      replayed: false,
    }
  })
}

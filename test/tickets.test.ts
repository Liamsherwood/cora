import { eq } from "drizzle-orm"
import { afterAll, describe, expect, it } from "vitest"

import type { DB } from "@/lib/db"
import { cases } from "@/lib/db/schema/operations"
import {
  buildings,
  leaseParties,
  leases,
  parties,
  properties,
  units,
} from "@/lib/db/schema/portfolio"
import { ticketIntakes } from "@/lib/db/schema/tickets"
import {
  finishTicketIntake,
  listTicketActivity,
  startTicketIntake,
} from "@/lib/tickets/activity"
import {
  getTicket,
  linkTicketToTenancy,
  listTicketRuns,
  listTickets,
  recordTicketRun,
  resolveTicket,
  setTicketRunSendStatus,
} from "@/lib/tickets/repository"

import { closeDb, testDb } from "./helpers"

const reportRun = {
  threadKey: "test-thread",
  messageKey: "first-report",
  agent: "cora-whatsapp",
  model: "test/model",
  gatewayGenerationId: "gen_test_report",
  startedAt: new Date("2026-11-21T09:00:00Z"),
  replyType: "generated",
  report: { kind: "report", summary: "Kitchen tap leaking in unit 4B." },
} as const

async function addTenant(
  db: DB,
  name: string,
  phone: string,
  startDate = "2020-01-01"
) {
  const [property] = await db
    .insert(properties)
    .values({
      address: `Example property for ${name}`,
      isWeg: false,
    })
    .returning()
  const [building] = await db
    .insert(buildings)
    .values({ propertyId: property.id })
    .returning()
  const [unit] = await db
    .insert(units)
    .values({
      buildingId: building.id,
      propertyId: property.id,
      identifier: "4B",
    })
    .returning()
  const [party] = await db
    .insert(parties)
    .values({ type: "tenant", name, phone })
    .returning()
  const [lease] = await db
    .insert(leases)
    .values({
      unitId: unit.id,
      rentColdEur: "700.00",
      startDate,
    })
    .returning()
  await db
    .insert(leaseParties)
    .values({ leaseId: lease.id, partyId: party.id, role: "tenant" })
  return { property, unit, party }
}

afterAll(closeDb)

describe("WhatsApp ticket intake", () => {
  it("records a replayed report once and traces updates and failed sends on the same ticket", async () => {
    const db = testDb()
    const [first, replay] = await Promise.all([
      recordTicketRun(db, reportRun),
      recordTicketRun(db, reportRun),
    ])
    const openedRunId = first ?? replay
    expect([first, replay].filter(Boolean)).toHaveLength(1)
    await setTicketRunSendStatus(db, openedRunId!, "accepted")

    const updatedRunId = await recordTicketRun(db, {
      ...reportRun,
      messageKey: "follow-up",
      startedAt: new Date("2026-11-21T09:01:00Z"),
      report: {
        kind: "follow_up",
        summary: "Kitchen tap in unit 4B leaking into the cupboard.",
      },
    })
    const fallbackRunId = await recordTicketRun(db, {
      ...reportRun,
      messageKey: "failed-reply",
      startedAt: new Date("2026-11-21T09:02:00Z"),
      gatewayGenerationId: undefined,
      replyType: "fallback",
      report: null,
    })
    await setTicketRunSendStatus(db, fallbackRunId!, "failed")
    expect(
      await recordTicketRun(db, {
        ...reportRun,
        messageKey: "unrelated-question",
        report: null,
      })
    ).toBeNull()

    const tickets = await listTickets(db, 1)
    expect(tickets).toHaveLength(1)
    expect(tickets[0].summary).toBe(
      "Kitchen tap in unit 4B leaking into the cupboard."
    )
    expect(await listTicketRuns(db, tickets[0].id)).toMatchObject([
      {
        id: openedRunId,
        ticketChange: "opened",
        gatewayGenerationId: "gen_test_report",
        sendStatus: "accepted",
      },
      { id: updatedRunId, ticketChange: "updated", sendStatus: "unconfirmed" },
      {
        id: fallbackRunId,
        ticketChange: "none",
        replyType: "fallback",
        sendStatus: "failed",
      },
    ])

    await resolveTicket(db, tickets[0].id)
    expect((await getTicket(db, tickets[0].id))?.resolvedAt).toBeInstanceOf(
      Date
    )
    expect(await recordTicketRun(db, reportRun)).toBeNull()
    expect(
      await recordTicketRun(db, {
        ...reportRun,
        messageKey: "late-follow-up",
        report: {
          kind: "follow_up",
          summary: "The same tap is leaking into the cupboard.",
        },
      })
    ).toBeNull()

    const newRunId = await recordTicketRun(db, {
      ...reportRun,
      messageKey: "new-report",
      report: { kind: "report", summary: "Hallway light stopped working." },
    })
    const newTickets = await listTickets(db, 1)
    expect(newTickets).toHaveLength(2)
    const newTicket = newTickets.find(({ id }) => id !== tickets[0].id)!
    expect(newTicket.summary).toBe("Hallway light stopped working.")
    expect(await listTicketRuns(db, newTicket.id)).toMatchObject([
      { id: newRunId, ticketChange: "opened" },
    ])
    expect(await listTicketRuns(db, tickets[0].id)).toHaveLength(3)
  })

  it("writes one case for the matching current tenant, unit and property", async () => {
    const db = testDb()
    const tenant = await addTenant(db, "Bob Example", "+49 (157) 000-01234")
    await addTenant(db, "Future tenant", "+4915700001234", "2099-01-01")
    const report = {
      kind: "report",
      summary: "Water leaking under Bob’s kitchen sink.",
    } as const
    const run = {
      ...reportRun,
      threadKey: "matched-tenant",
      messageKey: "matched-tenant-report",
      senderPhone: "4915700001234",
      report,
    }
    await Promise.all([recordTicketRun(db, run), recordTicketRun(db, run)])

    const ticket = (await listTickets(db, 1)).find(
      (item) => item.summary === report.summary
    )!
    expect(ticket).toMatchObject({
      tenantName: tenant.party.name,
      propertyAddress: tenant.property.address,
      unitIdentifier: tenant.unit.identifier,
    })
    const linkedCases = await db
      .select()
      .from(cases)
      .where(eq(cases.reporterPartyId, tenant.party.id))
    expect(linkedCases).toMatchObject([
      {
        id: ticket.caseId,
        propertyId: tenant.property.id,
        unitId: tenant.unit.id,
        category: "maintenance",
        status: "open",
      },
    ])

    await resolveTicket(db, ticket.id)
    const [resolved] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, linkedCases[0].id))
    expect(resolved.status).toBe("resolved")
  })

  it("keeps shared phone numbers unassigned until staff choose a valid tenancy", async () => {
    const db = testDb()
    const tenant = await addTenant(db, "Alice Example", "+4915700005678")
    const other = await addTenant(db, "Charlie Example", "+49 157 0000 5678")
    const report = {
      kind: "report",
      summary: "A radiator is dripping.",
    } as const
    await recordTicketRun(db, {
      ...reportRun,
      threadKey: "shared-phone",
      messageKey: "shared-phone-report",
      senderPhone: "4915700005678",
      report,
    })

    const ticket = (await listTickets(db, 1)).find(
      (item) => item.summary === report.summary
    )!
    expect(ticket.caseId).toBeNull()
    expect(
      await linkTicketToTenancy(db, ticket.id, tenant.party.id, other.unit.id)
    ).toBe(false)
    expect(
      await linkTicketToTenancy(db, ticket.id, tenant.party.id, tenant.unit.id)
    ).toBe(true)
    expect(
      await linkTicketToTenancy(db, ticket.id, other.party.id, other.unit.id)
    ).toBe(false)
    expect(await getTicket(db, ticket.id)).toMatchObject({
      tenantName: tenant.party.name,
      propertyAddress: tenant.property.address,
      unitIdentifier: tenant.unit.identifier,
    })
  })

  it("shows intake before a ticket exists and follows it through review and reply", async () => {
    const db = testDb()
    const threadKey = "live-intake"
    const intake = await startTicketIntake(db, threadKey)
    expect(await listTicketActivity(db)).toEqual([
      { ticketId: null, sendingReply: false },
    ])

    const runId = await recordTicketRun(
      db,
      { ...reportRun, threadKey, messageKey: "live-intake-report" },
      intake
    )
    expect(runId).not.toBeNull()
    const [activity] = await listTicketActivity(db)
    expect(activity.sendingReply).toBe(true)
    expect(activity.ticketId).not.toBeNull()
    const ticketId = activity.ticketId!
    expect(await listTicketRuns(db, ticketId)).toMatchObject([
      { id: runId, sendStatus: "unconfirmed" },
    ])

    await setTicketRunSendStatus(db, runId!, "failed")
    await finishTicketIntake(db, intake)
    expect(await listTicketActivity(db)).toEqual([])
    expect(await listTicketRuns(db, ticketId)).toMatchObject([
      { id: runId, sendStatus: "failed" },
    ])

    const [abandoned] = await db
      .insert(ticketIntakes)
      .values({ ticketId, expiresAt: new Date(0) })
      .returning({ id: ticketIntakes.id })
    expect(await listTicketActivity(db)).toEqual([])

    const followUp = await startTicketIntake(db, threadKey)
    expect(await listTicketActivity(db)).toEqual([
      { ticketId, sendingReply: false },
    ])
    expect(
      await db
        .select()
        .from(ticketIntakes)
        .where(eq(ticketIntakes.id, abandoned.id))
    ).toEqual([])
    await finishTicketIntake(db, followUp)
    expect(await listTicketActivity(db)).toEqual([])
  })
})

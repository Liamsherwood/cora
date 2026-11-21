import { and, eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  activeWorkOrder,
  commissionContractor,
  findContractors,
  rankCandidates,
  type Candidate,
} from "@/lib/contractors/match"
import { distanceKm, isCity } from "@/lib/contractors/geo"
import { berlinTime, proposeVisit } from "@/lib/contractors/slots"
import type { DB } from "@/lib/db"
import * as t from "@/lib/db/schema"
import type { TicketClassification } from "@/lib/tickets/classification"
import { ticketPlan } from "@/lib/tickets/playbook"
import {
  getTicket,
  resolveTicket,
  saveTicketRun,
} from "@/lib/tickets/repository"
import { getCaller, openCases, reportIssue } from "@/lib/voice/caller"
import { readSeedFile } from "@/lib/seed"

import { closeDb, expectAppError, LENA, resetDb } from "./helpers"

const SCHMITZ = "40000000-0000-4000-8000-000000000301"
const CLASSEN = "40000000-0000-4000-8000-000000000302"
const LIFT_WEST = "b12db08d-cdaa-5367-b1da-6fc0f4587be9"
const LENNARTZ = "40000000-0000-4000-8000-000000000303"
const AT = new Date("2026-11-21T09:00:00Z") // Saturday, 10:00 in Aachen

describe("distances", () => {
  it("measures town centre to town centre", () => {
    expect(distanceKm("Aachen", "Aachen")).toBe(0)
    expect(distanceKm("Aachen", "Düsseldorf")).toBe(70)
    expect(distanceKm("Aachen", "Essen")).toBe(100)
    expect(distanceKm("Aachen", "Atlantis")).toBeNull()
  })

  it("knows every town in the seed", async () => {
    const seed = await readSeedFile()
    for (const p of seed.properties) expect(isCity(p.city), p.city).toBe(true)
    const organisations = new Set(
      seed.parties.filter((p) => p.type === "organization").map((p) => p.id)
    )
    for (const c of seed.contractor_profiles)
      expect(organisations.has(c.party_id), c.party_id).toBe(true)
  })
})

describe("visit slots", () => {
  it("sends an emergency service within 90 minutes", () => {
    expect(proposeVisit("emergency", new Date("2026-11-21T09:07:00Z"))).toEqual(
      new Date("2026-11-21T10:45:00Z")
    )
  })

  it("books routine visits on the next working day and skips booked jobs", () => {
    const monday8 = berlinTime("2026-11-23", 8)
    expect(monday8).toEqual(new Date("2026-11-23T07:00:00Z"))
    expect(proposeVisit("normal", AT)).toEqual(monday8)
    expect(proposeVisit("normal", AT, [monday8])).toEqual(
      berlinTime("2026-11-23", 10)
    )
    expect(proposeVisit("low", AT)).toEqual(berlinTime("2026-11-24", 8))
  })

  it("comes on a Saturday when it is urgent", () => {
    expect(proposeVisit("high", AT)).toEqual(berlinTime("2026-11-21", 13))
  })

  it("follows summer time", () => {
    expect(berlinTime("2026-07-06", 8)).toEqual(
      new Date("2026-07-06T06:00:00Z")
    )
  })
})

describe("ranking", () => {
  const base: Candidate = {
    partyId: "x",
    name: "x",
    phone: null,
    baseCity: "Aachen",
    distanceKm: 0,
    inArea: true,
    emergencyService: false,
    jobsHere: 0,
    openJobs: 0,
  }
  const local = { ...base, partyId: "local", name: "Local" }
  const known = { ...base, partyId: "known", name: "Known", jobsHere: 3 }
  const allNight = {
    ...base,
    partyId: "24h",
    name: "24h",
    emergencyService: true,
  }
  const far = {
    ...base,
    partyId: "far",
    name: "Far",
    distanceKm: 90,
    inArea: false,
    jobsHere: 9,
    emergencyService: true,
  }
  const order = (
    list: Candidate[],
    priority: TicketClassification["priority"]
  ) => rankCandidates(list, priority).map((c) => c.partyId)

  it("prefers the service area, then building history", () => {
    expect(order([far, local, known, allNight], "normal")).toEqual([
      "known",
      "24h",
      "local",
      "far",
    ])
  })

  it("puts 24/7 cover first in an emergency", () => {
    expect(order([far, local, known, allNight], "emergency")).toEqual([
      "24h",
      "known",
      "local",
      "far",
    ])
  })
})

describe("finding and booking a contractor", () => {
  let db: DB
  beforeEach(async () => {
    db = await resetDb()
  })
  afterAll(closeDb)

  async function voiceTicket(
    classification: TicketClassification,
    conversation = `conv_${classification.category}_${classification.priority}`
  ) {
    const r = await reportIssue(db, await getCaller(db, LENA), {
      ...classification,
      title: "Test",
      description: "Testmeldung für die Handwerkersuche.",
      summary: "Test report for contractor matching.",
      conversation_id: conversation,
    })
    return r.ticket_id
  }

  it("shortlists local plumbers, the one who knows the building first", async () => {
    const ticketId = await voiceTicket({
      category: "plumbing",
      priority: "normal",
      scope: "unit",
    })
    const search = await findContractors(db, ticketId, AT)
    expect(search).toMatchObject({
      trade: "plumber",
      city: "Aachen",
      searched: 6,
      inArea: 2,
    })
    expect(search.shortlist.map((c) => c.partyId)).toEqual([
      SCHMITZ,
      CLASSEN,
      expect.any(String),
    ])
    expect(search.shortlist[0]).toMatchObject({
      jobsHere: 2,
      distanceKm: 0,
      inArea: true,
      visit: berlinTime("2026-11-23", 8).toISOString(),
    })
    expect(search.shortlist[2]!.inArea).toBe(false)
  })

  it("matches each trade to its own contractors", async () => {
    const lift = await findContractors(
      db,
      await voiceTicket({
        category: "elevator",
        priority: "emergency",
        scope: "common",
      }),
      AT
    )
    expect(lift.shortlist[0]).toMatchObject({
      partyId: LIFT_WEST,
      baseCity: "Essen",
      distanceKm: 100,
      inArea: true,
      emergencyService: true,
    })
    const wiring = await findContractors(
      db,
      await voiceTicket({
        category: "internet",
        priority: "low",
        scope: "unit",
      }),
      AT
    )
    expect(wiring.trade).toBe("electrician")
    expect(wiring.shortlist[0]!.partyId).toBe(LENNARTZ)
    const pests = await findContractors(
      db,
      await voiceTicket({
        category: "pests",
        priority: "normal",
        scope: "unit",
      }),
      AT
    )
    expect(pests.inArea).toBe(0)
    expect(pests.shortlist[0]!.baseCity).toBe("Krefeld")
  })

  it("books once, tells the agent, and frees the slot when resolved", async () => {
    const ticketId = await voiceTicket({
      category: "plumbing",
      priority: "high",
      scope: "unit",
    })
    const [first, second] = await Promise.all([
      commissionContractor(db, ticketId, SCHMITZ, AT),
      commissionContractor(db, ticketId, CLASSEN, AT),
    ])
    expect([first.replayed, second.replayed].sort()).toEqual([false, true])
    expect(second.workOrderId).toBe(first.workOrderId)
    const orders = await db.select().from(t.workOrders)
    const booked = orders.filter((o) => o.id === first.workOrderId)
    expect(booked).toHaveLength(1)
    expect(booked[0]).toMatchObject({
      status: "scheduled",
      scheduledAt: berlinTime("2026-11-21", 13),
    })

    const ticket = (await getTicket(db, ticketId))!
    const [kase] = await db
      .select()
      .from(t.cases)
      .where(eq(t.cases.id, ticket.caseId!))
    expect(kase!.status).toBe("scheduled")
    const [event] = await db
      .select()
      .from(t.events)
      .where(eq(t.events.type, "work_order.scheduled"))
    expect(event!.payload).toMatchObject({
      work_order_id: first.workOrderId,
      confirmation: "simulated",
    })

    // Cora reads the visit back on the next call.
    const [open] = await openCases(db, await getCaller(db, LENA))
    expect(open).toMatchObject({
      status: "scheduled",
      contractor: first.contractorName,
      next_visit: "Sat 21 Nov, 13:00",
    })
    // Booking meets the response target.
    const plan = ticketPlan(
      { ...ticket, commissioned: true },
      new Date("2026-11-30T00:00:00Z")
    )
    expect(plan.overdue).toBe(false)
    expect(plan.steps.find((s) => s.kind === "commission")).toMatchObject({
      done: true,
    })

    await resolveTicket(db, ticketId)
    expect(await activeWorkOrder(db, ticket.caseId!)).toMatchObject({
      status: "completed",
    })
    await expectAppError(commissionContractor(db, ticketId, SCHMITZ, AT), 422)
  })

  it("refuses a contractor of another trade, and tickets it can't place", async () => {
    const ticketId = await voiceTicket({
      category: "plumbing",
      priority: "normal",
      scope: "unit",
    })
    await expectAppError(commissionContractor(db, ticketId, LENNARTZ, AT), 422)
    const noise = await voiceTicket({
      category: "noise",
      priority: "low",
      scope: "unit",
    })
    await expectAppError(findContractors(db, noise, AT), 422)

    const unmatched = await saveTicketRun(db, {
      threadKey: "unknown-sender",
      messageKey: "unknown-sender-1",
      agent: "cora-whatsapp",
      startedAt: AT,
      replyType: "generated",
      report: {
        kind: "report",
        summary: "Leaking tap.",
        classification: {
          category: "plumbing",
          priority: "normal",
          scope: "unit",
        },
      },
    })
    await expectAppError(findContractors(db, unmatched!.ticketId, AT), 422)
    await expectAppError(
      findContractors(db, "00000000-0000-4000-8000-000000000000", AT),
      404
    )
    expect(
      await db
        .select()
        .from(t.workOrders)
        .where(and(eq(t.workOrders.status, "scheduled")))
    ).toHaveLength(
      (await readSeedFile()).work_orders.filter((w) => w.status === "scheduled")
        .length
    )
  })
})

import { eq } from "drizzle-orm"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { DB } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { berlinAt, planSlot, readReply } from "@/lib/dispatch/plan"
import { stepOf, type DispatchView } from "@/lib/dispatch/steps"
import { resetDemoData } from "@/lib/seed"

import { closeDb, resetDb } from "./helpers"

process.env.DISPATCH_SIMULATED_REPLY_MS = "0"
const { advanceDispatch, handleContractorReply, startDispatch } =
  await import("@/lib/dispatch/engine")

// Seed properties behind the dashboard's demo requests.
const DOROTHEEN = "2bb9ecd8-944b-5bfd-b6e6-4c4f81a4ceb9"
const MUENSTER = "e236b232-2232-52bc-9255-0875045e36d5"

const heating = {
  requestKey: "heating",
  propertyId: DOROTHEEN,
  title: "Heating outage",
  description: "Radiators on the third floor are cold.",
  priority: "Urgent" as const,
}

let db: DB
beforeEach(async () => {
  db = await resetDb()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
afterAll(closeDb)

async function runUntil(view: DispatchView, stop: DispatchView["status"][]) {
  for (let i = 0; i < 12 && !stop.includes(view.status); i++)
    view = await advanceDispatch(db, view.id)
  return view
}

describe("dispatch", () => {
  it("works through every step and books a work order on the property", async () => {
    let view = await startDispatch(db, heating)
    expect(view.steps.every((s) => s.status === "pending")).toBe(true)

    view = await advanceDispatch(db, view.id)
    expect(view.steps.map((s) => s.status)).toEqual([
      "done",
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
    ])
    expect(stepOf(view.steps, "building")?.detail?.system).toBe(
      "gas central heating"
    )

    view = await runUntil(view, ["done", "failed"])
    expect(view.status).toBe("done")
    expect(view.steps.every((s) => s.status === "done")).toBe(true)

    const contractor = stepOf(view.steps, "contractor")!.detail!
    expect(contractor.jobsHere).toBeGreaterThan(0)
    const message = stepOf(view.steps, "message")!.detail!
    expect(message.mode).toBe("simulated")
    // German contractor, German text, the request's address.
    expect(message.text).toMatch(/Heizungsausfall, Dorotheenstraße 47/)

    const [row] = await db
      .select()
      .from(t.maintenanceDispatches)
      .where(eq(t.maintenanceDispatches.id, view.id))
    const [order] = await db
      .select()
      .from(t.workOrders)
      .where(eq(t.workOrders.id, row!.workOrderId!))
    expect(order).toMatchObject({
      caseId: row!.caseId,
      contractorId: row!.contractorId,
      status: "scheduled",
      payer: "weg",
    })
    expect(order!.scheduledAt).toEqual(row!.slotStart)
    const [kase] = await db
      .select()
      .from(t.cases)
      .where(eq(t.cases.id, row!.caseId!))
    expect(kase).toMatchObject({
      propertyId: DOROTHEEN,
      category: "heating",
      priority: "emergency",
      status: "scheduled",
    })
  })

  it("is one dispatch per request", async () => {
    const a = await startDispatch(db, heating)
    const b = await startDispatch(db, { ...heating, title: "again" })
    expect(b.id).toBe(a.id)
  })

  it("runs a step once when two tabs advance at the same time", async () => {
    const { id } = await startDispatch(db, heating)
    await Promise.all([advanceDispatch(db, id), advanceDispatch(db, id)])
    const view = await advanceDispatch(db, id)
    expect(view.steps.filter((s) => s.status === "done")).toHaveLength(3)
  })

  it("stops and says why when no contractor is reachable on WhatsApp", async () => {
    const view = await runUntil(
      await startDispatch(db, {
        ...heating,
        requestKey: "inspection",
        title: "Elevator inspection",
        priority: "Routine",
      }),
      ["done", "failed"]
    )
    expect(view.status).toBe("failed")
    expect(stepOf(view.steps, "contractor")).toMatchObject({
      status: "failed",
      error: "no_contractor",
    })
  })

  it("demo reset removes dispatches and what they booked", async () => {
    const view = await runUntil(await startDispatch(db, heating), ["done"])
    expect(view.status).toBe("done")
    await resetDemoData(db)
    expect(await db.select().from(t.maintenanceDispatches)).toHaveLength(0)
  })
})

describe("live WhatsApp", () => {
  const PHONE = "+49 170 0000000"
  let sent: unknown[]

  beforeEach(() => {
    sent = []
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token")
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123")
    vi.stubEnv("DEMO_CONTRACTOR_PHONE_OVERRIDE", PHONE)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)))
        return Response.json({ messages: [{ id: "wamid.1" }] })
      })
    )
  })

  const leak = {
    ...heating,
    requestKey: "leak",
    propertyId: MUENSTER,
    title: "Water leak",
  }

  it("messages the contractor and books when they say yes", async () => {
    const view = await runUntil(await startDispatch(db, leak), ["waiting"])
    expect(sent).toEqual([
      expect.objectContaining({
        to: "491700000000",
        type: "text",
        text: expect.objectContaining({
          body: expect.stringMatching(/Ja oder Nein/),
        }),
      }),
    ])
    // No simulated yes in live mode: still waiting.
    expect((await advanceDispatch(db, view.id)).status).toBe("waiting")

    expect(await handleContractorReply(db, "4915199999999", "Ja")).toBeNull()
    expect(
      await handleContractorReply(db, "491700000000", "Hm, wann?")
    ).toMatch(/Ja oder Nein/)
    expect(
      await handleContractorReply(db, "491700000000", "Ja, passt!")
    ).toMatch(/gebucht/)
    const [row] = await db.select().from(t.maintenanceDispatches)
    expect(row!.status).toBe("done")
    expect(row!.workOrderId).not.toBeNull()
  })

  it("stops when the contractor declines", async () => {
    await runUntil(await startDispatch(db, leak), ["waiting"])
    await handleContractorReply(db, "491700000000", "Nein, leider nicht")
    const [row] = await db.select().from(t.maintenanceDispatches)
    expect(row!.status).toBe("failed")
    expect(stepOf(row!.steps, "confirmation")?.error).toBe("declined")
  })

  it("fails the step, not the request, when Meta refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { message: "nope" } }, { status: 400 })
      )
    )
    const view = await runUntil(await startDispatch(db, leak), [
      "waiting",
      "failed",
    ])
    expect(stepOf(view.steps, "message")).toMatchObject({
      status: "failed",
      error: "send_failed",
    })
  })
})

describe("slot planning", () => {
  it("sends urgent work out the same day, weekends included, two hours ahead", () => {
    const saturday = berlinAt("2026-11-21", 9)
    expect(planSlot(saturday, "Urgent", []).start).toEqual(
      berlinAt("2026-11-21", 12)
    )
  })

  it("puts high priority on the next business day and skips the contractor's jobs", () => {
    const friday = berlinAt("2026-11-20", 10)
    expect(planSlot(friday, "High", []).start).toEqual(
      berlinAt("2026-11-23", 8)
    )
    expect(planSlot(friday, "High", [berlinAt("2026-11-23", 9)]).start).toEqual(
      berlinAt("2026-11-23", 12)
    )
  })

  it("leaves three business days for routine work", () => {
    const friday = berlinAt("2026-11-20", 10)
    expect(planSlot(friday, "Routine", []).start).toEqual(
      berlinAt("2026-11-25", 8)
    )
  })
})

describe("reading replies", () => {
  it.each([
    ["Ja", true],
    ["ok 👍", true],
    ["Passt, bin da", true],
    ["Nein", false],
    ["Geht leider nicht", false],
    ["Wann genau?", null],
  ])("%s → %s", (text, expected) => {
    expect(readReply(text)).toBe(expected)
  })
})

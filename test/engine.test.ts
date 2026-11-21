import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { DB } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { getUnitSnapshot } from "@/lib/centrix/repository"
import { loadManifestFiles, registerPartner } from "@/lib/connectors/registry"
import { StatusUpdateSchema } from "@/lib/connectors/spec"
import { newId } from "@/lib/ids"
import { partnerSecret, sign } from "@/lib/partner/signature"
import { handlePartnerWebhook } from "@/lib/partner/webhook"
import {
  acceptOffer,
  applyPartnerStatus,
  declineOffer,
  detectMoveIn,
  getRunView,
  hasStartedMoveIn,
  listPartnerOrders,
  markOfferSent,
  revokeConsent,
  triggerEvent,
} from "@/lib/workflow/engine"

import {
  closeDb,
  expectAppError,
  JONAS,
  LENA,
  resetDb,
  UNIT_4B,
} from "./helpers"

let db: DB
beforeEach(async () => {
  db = await resetDb()
})
afterAll(closeDb)

const moveIn = (id: string = newId(), moveInDate = "2026-12-01") =>
  triggerEvent(db, {
    id,
    type: "tenant.move_in",
    unit_id: UNIT_4B,
    party_id: LENA,
    payload: { move_in_date: moveInDate },
  })

async function offeredRun(slug = "example_fibre") {
  const run = (await moveIn()).runs.find((r) => r.partner_slug === slug)!
  await markOfferSent(db, run.id, { channel: "portal", actor: "system" })
  return run
}

const ordersOf = (runId: string) =>
  db
    .select()
    .from(t.serviceOrders)
    .where(eq(t.serviceOrders.workflowRunId, runId))

const status = (
  order_id: string,
  s: "accepted" | "scheduled" | "active" | "rejected",
  extra: { activation_date?: string; note?: string } = {}
) => ({
  order_id,
  status: s,
  event_id: `pevt_${newId()}`,
  occurred_at: "2026-11-20T10:00:00Z",
  ...extra,
})

describe("move-in -> internet, end to end", () => {
  it("runs from event to contract on the unit", async () => {
    const ev = await moveIn()
    expect(ev.runs.map((r) => r.partner_slug).sort()).toEqual([
      "example_fibre",
      "stadtwerk_energy",
    ])
    const run = ev.runs.find((r) => r.partner_slug === "example_fibre")!
    expect(run.state).toBe("detected")

    // 7 business days to move-in, fibre needs 10: real start date + 5G bridge.
    const offered = await getRunView(db, run.id)
    expect(offered.offer?.start_date).toBe("2026-12-04")
    expect(offered.offer?.on_time).toBe(false)
    expect(offered.offer?.bridge?.ready_by).toBe("2026-11-24")

    await markOfferSent(db, run.id, {
      channel: "voice",
      actor: "ai",
      costCents: 30,
    })
    const { order_id } = await acceptOffer(db, run.id, { channel: "voice" })

    const [order] = await db
      .select()
      .from(t.serviceOrders)
      .where(eq(t.serviceOrders.id, order_id))
    expect(Object.keys(order!.sharedPayload as object).sort()).toEqual(
      [
        "address",
        "bridge",
        "email",
        "move_in_date",
        "name",
        "offer_id",
        "product",
        "requested_start_date",
      ].sort()
    )
    const shared = JSON.stringify(order!.sharedPayload)
    expect(shared).not.toContain("Maria") // owner never shared
    expect(shared).not.toContain("780") // rent never shared

    await applyPartnerStatus(db, "example_fibre", status(order_id, "accepted"))
    const [signed] = await ordersOf(run.id)
    expect(signed!.contractStatus).toBe("signed")
    expect(signed!.monthlyPriceEur).toBe("34.99")

    const r = await applyPartnerStatus(
      db,
      "example_fibre",
      status(order_id, "active", { activation_date: "2026-12-04" })
    )
    expect(r.state).toBe("closed")
    const [live] = await ordersOf(run.id)
    expect(live!.contractStatus).toBe("active")
    expect(live!.startDate).toBe("2026-12-04")

    const view = await getRunView(db, run.id)
    expect(view.metrics.manual_touches).toBe(0)
    expect(view.metrics.ai_cost_cents).toBe(30)
    expect(
      view.audit.filter((a) => a.type === "state_change").map((a) => a.toState)
    ).toEqual([
      "offer_sent",
      "consent_given",
      "ordered",
      "confirmed",
      "active",
      "closed",
    ])
    expect(view.consent?.channel).toBe("voice")
  })
})

describe("idempotency", () => {
  it("marks only the move-in for the date started from the unit", async () => {
    const { tenant } = await getUnitSnapshot(db, UNIT_4B)
    const moveInDay = tenant!.move_in
    await expect(hasStartedMoveIn(db, UNIT_4B, moveInDay)).resolves.toBe(false)

    await detectMoveIn(db, UNIT_4B)

    await expect(hasStartedMoveIn(db, UNIT_4B, moveInDay)).resolves.toBe(true)
    await expect(hasStartedMoveIn(db, UNIT_4B, "2027-01-01")).resolves.toBe(false)
  })

  it("same event twice does not create a second flow", async () => {
    const id = newId()
    const a = await moveIn(id)
    const b = await moveIn(id)
    expect(b.duplicate).toBe(true)
    expect(b.runs.map((r) => r.id).sort()).toEqual(
      a.runs.map((r) => r.id).sort()
    )
    expect(await db.select().from(t.workflowRuns)).toHaveLength(2)
  })

  it("the same event delivered concurrently still creates one flow", async () => {
    const id = newId()
    const results = await Promise.all([moveIn(id), moveIn(id), moveIn(id)])
    const runIds = new Set(results.flatMap((r) => r.runs.map((x) => x.id)))
    expect(runIds.size).toBe(2)
    expect(await db.select().from(t.workflowRuns)).toHaveLength(2)
  })

  it("a replayed partner webhook is applied once", async () => {
    const run = await offeredRun()
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" })
    const upd = status(order_id, "accepted")
    const first = await applyPartnerStatus(db, "example_fibre", upd)
    const again = await applyPartnerStatus(db, "example_fibre", upd)
    expect(first.duplicate).toBe(false)
    expect(again.duplicate).toBe(true)
    const confirmations = (await getRunView(db, run.id)).audit.filter(
      (a) => a.toState === "confirmed"
    )
    expect(confirmations).toHaveLength(1)
  })
})

describe("double click and races", () => {
  it("cannot accept before the offer was sent; a retried accept returns the same order", async () => {
    const run = (await moveIn()).runs.find(
      (r) => r.partner_slug === "example_fibre"
    )!
    await expectAppError(acceptOffer(db, run.id, { channel: "portal" }), 409)
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" })
    const first = await acceptOffer(db, run.id, { channel: "portal" })
    const again = await acceptOffer(db, run.id, { channel: "voice" })
    expect(again).toEqual({ order_id: first.order_id, already_ordered: true })
    expect(await ordersOf(run.id)).toHaveLength(1)
  })

  it("concurrent double click creates exactly one order and both get it back", async () => {
    const run = await offeredRun()
    const results = await Promise.all([
      acceptOffer(db, run.id, { channel: "portal" }),
      acceptOffer(db, run.id, { channel: "portal" }),
      acceptOffer(db, run.id, { channel: "voice" }),
    ])
    expect(new Set(results.map((r) => r.order_id)).size).toBe(1)
    expect(results.filter((r) => !r.already_ordered)).toHaveLength(1)
    expect(await ordersOf(run.id)).toHaveLength(1)
    expect(await db.select().from(t.consents)).toHaveLength(1)
  })

  it("racing 'scheduled' and 'active' webhooks never move the order backwards", async () => {
    // FOR UPDATE on the order serialises the two; without it the slower "scheduled"
    // could overwrite an already committed "active".
    for (let i = 0; i < 5; i++) {
      db = await resetDb()
      const run = await offeredRun()
      const { order_id } = await acceptOffer(db, run.id, { channel: "portal" })
      await applyPartnerStatus(
        db,
        "example_fibre",
        status(order_id, "accepted")
      )
      await Promise.all([
        applyPartnerStatus(db, "example_fibre", status(order_id, "scheduled")),
        applyPartnerStatus(db, "example_fibre", status(order_id, "active")),
      ])
      const [order] = await ordersOf(run.id)
      expect(order!.status).toBe("active")
      expect(order!.contractStatus).toBe("active")
      expect((await getRunView(db, run.id)).run.state).toBe("closed")
    }
  })

  it("a stale update after 'active' is recorded but changes nothing", async () => {
    const run = await offeredRun()
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" })
    await applyPartnerStatus(db, "example_fibre", status(order_id, "active"))
    const stale = await applyPartnerStatus(
      db,
      "example_fibre",
      status(order_id, "accepted")
    )
    expect(stale.ignored).toBe(true)
    expect((await getRunView(db, run.id)).run.state).toBe("closed")
    expect((await ordersOf(run.id))[0]!.status).toBe("active")
  })
})

describe("partner isolation", () => {
  it("a partner can't touch another partner's order", async () => {
    const run = await offeredRun()
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" })
    await expectAppError(
      applyPartnerStatus(db, "stadtwerk_energy", status(order_id, "active")),
      404
    )
    expect((await ordersOf(run.id))[0]!.status).toBe("sent")
    expect((await getRunView(db, run.id)).run.state).toBe("ordered")
  })

  it("a partner's webhook secret can't sign for another partner", async () => {
    process.env.PARTNER_WEBHOOK_SECRET = "test-master-key"
    expect(partnerSecret("example_fibre")).not.toBe(
      partnerSecret("stadtwerk_energy")
    )
    const run = await offeredRun("stadtwerk_energy")
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" })
    const body = JSON.stringify(status(order_id, "accepted"))
    // Signed with example_fibre's secret, sent to stadtwerk_energy's webhook.
    await expectAppError(
      handlePartnerWebhook(
        db,
        "stadtwerk_energy",
        body,
        sign(partnerSecret("example_fibre"), body)
      ),
      401
    )
    await handlePartnerWebhook(
      db,
      "stadtwerk_energy",
      body,
      sign(partnerSecret("stadtwerk_energy"), body)
    )
    expect((await ordersOf(run.id))[0]!.status).toBe("accepted")
  })

  it("a partner can't send a status it did not declare", async () => {
    const run = await offeredRun("stadtwerk_energy")
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" })
    await expectAppError(
      applyPartnerStatus(db, "stadtwerk_energy", status(order_id, "scheduled")),
      422
    )
  })

  it("the partner feed only lists its own orders", async () => {
    const fibre = await offeredRun("example_fibre")
    await acceptOffer(db, fibre.id, { channel: "portal" })
    const energy = (await listPartnerOrders(db, "stadtwerk_energy")).length
    const own = await listPartnerOrders(db, "example_fibre")
    expect(energy).toBe(0)
    expect(own).toHaveLength(1)
  })
})

describe("consent", () => {
  it("covers only the fields the tenant was shown", async () => {
    const run = await offeredRun()
    // The partner re-registers its manifest after the offer went out, now also asking for phone.
    const fibre = (await loadManifestFiles()).find(
      (r) => r.ok && r.manifest.id === "example_fibre"
    )
    if (!fibre?.ok) throw new Error("fixture")
    await registerPartner(db, {
      ...fibre.manifest,
      required_context: [...fibre.manifest.required_context, "phone"],
    })
    await expectAppError(acceptOffer(db, run.id, { channel: "portal" }), 409)
    expect(await ordersOf(run.id)).toHaveLength(0)
    expect(await db.select().from(t.consents)).toHaveLength(0)
  })

  it("refuses partial or extra consent", async () => {
    const run = await offeredRun()
    await expectAppError(
      acceptOffer(db, run.id, { channel: "portal", fields: ["name"] }),
      422
    )
    await expectAppError(
      acceptOffer(db, run.id, {
        channel: "portal",
        fields: ["name", "address", "move_in_date", "email", "phone"],
      }),
      422
    )
    expect(await ordersOf(run.id)).toHaveLength(0)
  })

  it("decline shares nothing", async () => {
    const run = await offeredRun()
    await declineOffer(db, run.id, { channel: "portal" })
    expect(await db.select().from(t.serviceOrders)).toHaveLength(0)
    expect(await db.select().from(t.consents)).toHaveLength(0)
  })

  it("revoking consent keeps the history and redacts the partner feed", async () => {
    const run = await offeredRun()
    await acceptOffer(db, run.id, { channel: "portal" })
    await revokeConsent(db, run.id, { channel: "portal" })
    const rows = await listPartnerOrders(db, "example_fibre")
    expect(rows).toHaveLength(1) // the order itself is kept
    expect(rows[0]?.consentRevokedAt).toBeTruthy()
  })
})

describe("guards", () => {
  it("unknown unit -> 404, tenant mismatch -> 422", async () => {
    await expectAppError(
      triggerEvent(db, { type: "tenant.move_in", unit_id: newId() }),
      404
    )
    await expectAppError(
      triggerEvent(db, {
        type: "tenant.move_in",
        unit_id: UNIT_4B,
        party_id: JONAS,
      }),
      422
    )
  })

  it("partner gets the move-in date from the event, not stale master data", async () => {
    const ev = await moveIn(newId(), "2026-12-15")
    const run = ev.runs.find((r) => r.partner_slug === "example_fibre")!
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" })
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" })
    const [order] = await db
      .select()
      .from(t.serviceOrders)
      .where(eq(t.serviceOrders.id, order_id))
    expect((order!.sharedPayload as Record<string, unknown>).move_in_date).toBe(
      "2026-12-15"
    )
  })
})

describe("dates (stress-test findings)", () => {
  it("an event without an id is still one event when retried", async () => {
    const fire = () =>
      triggerEvent(db, {
        type: "tenant.move_in",
        unit_id: UNIT_4B,
        payload: { move_in_date: "2026-12-01" },
      })
    const [a, b] = await Promise.all([fire(), fire()])
    const c = await fire()
    expect(b.event_id).toBe(a.event_id)
    expect(c.duplicate).toBe(true)
    expect(await db.select().from(t.workflowRuns)).toHaveLength(2)
  })

  it("rejects impossible and long-past move-in dates with 422", async () => {
    for (const d of ["2026-13-45", "2026-02-31", "1.12.2026", 20261201])
      await expectAppError(moveIn(newId(), d as string), 422)
    await expectAppError(moveIn(newId(), "2026-09-01"), 422)
    // A move-in a few days ago still counts.
    const recent = await moveIn(newId(), "2026-11-16")
    expect(recent.runs.length).toBeGreaterThan(0)
  })

  it("rejects an impossible or implausible activation date", async () => {
    const run = await offeredRun()
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" })
    expect(
      StatusUpdateSchema.safeParse(
        status(order_id, "active", { activation_date: "2026-02-31" })
      ).success
    ).toBe(false)
    for (const d of ["1999-01-01", "2031-01-01"])
      await expectAppError(
        applyPartnerStatus(
          db,
          "example_fibre",
          status(order_id, "active", { activation_date: d })
        ),
        422
      )
    const [order] = await ordersOf(run.id)
    expect(order!.status).toBe("sent")
  })
})

describe("contract on the unit", () => {
  it("a rejection after acceptance cancels the signed contract", async () => {
    const run = await offeredRun()
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" })
    await applyPartnerStatus(db, "example_fibre", status(order_id, "accepted"))
    expect(
      (await getUnitSnapshot(db, UNIT_4B)).service_contracts.map(
        (c) => c.status
      )
    ).toEqual(["signed"])

    await applyPartnerStatus(
      db,
      "example_fibre",
      status(order_id, "rejected", { note: "Address not serviceable" })
    )
    const [order] = await ordersOf(run.id)
    expect(order!.contractStatus).toBe("cancelled")
    expect(order!.bridge).toBeNull()
    expect((await getRunView(db, run.id)).run.state).toBe("rejected")
    expect(
      (await getUnitSnapshot(db, UNIT_4B)).service_contracts.map(
        (c) => c.status
      )
    ).toEqual(["cancelled"])
  })

  it("a rejection before acceptance leaves no contract", async () => {
    const run = await offeredRun()
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" })
    await applyPartnerStatus(db, "example_fibre", status(order_id, "rejected"))
    expect((await ordersOf(run.id))[0]!.contractStatus).toBeNull()
    expect((await getUnitSnapshot(db, UNIT_4B)).service_contracts).toEqual([])
  })
})

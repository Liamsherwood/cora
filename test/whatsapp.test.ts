import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { DB } from "@/lib/db"
import { newId } from "@/lib/ids"
import { getRunView, markOfferSent, triggerEvent } from "@/lib/workflow/engine"

import { closeDb, expectAppError, LENA, resetDb, UNIT_4B } from "./helpers"

vi.mock("server-only", () => ({}))
const { sendOfferWhatsApp } = await import("@/lib/whatsapp/outbound")

let db: DB
beforeEach(async () => {
  db = await resetDb()
  delete process.env.WHATSAPP_OFFER_TEMPLATE
})
afterAll(closeDb)

async function fibreRun() {
  const ev = await triggerEvent(db, {
    id: newId(),
    type: "tenant.move_in",
    unit_id: UNIT_4B,
    party_id: LENA,
    payload: { move_in_date: "2026-12-01" },
  })
  return ev.runs.find((r) => r.partner_slug === "example_fibre")!
}

const whatsappAudits = async (runId: string) =>
  (await getRunView(db, runId)).audit.filter((a) => a.type === "whatsapp.sent")

describe("offer on WhatsApp", () => {
  it("is the first contact: sends the offer and moves the run to offer_sent", async () => {
    const run = await fibreRun()
    expect(await sendOfferWhatsApp(db, run.id, "de")).toEqual({
      mode: "simulated",
    })
    const view = await getRunView(db, run.id)
    expect(view.run.state).toBe("offer_sent")
    const sent = view.audit.find((a) => a.toState === "offer_sent")
    expect(sent?.details).toEqual({ channel: "whatsapp" })
    expect(view.messages.at(-1)?.content).toMatch(/WhatsApp/)
    const [audit] = await whatsappAudits(run.id)
    expect(audit?.details).toEqual({ mode: "simulated", reminder: false })
    expect(audit?.costCents).toBeGreaterThan(0)
  })

  it("sends one reminder after another channel, never a second message", async () => {
    const run = await fibreRun()
    await markOfferSent(db, run.id, { channel: "voice", actor: "ai" })
    await sendOfferWhatsApp(db, run.id, "de")
    const [audit] = await whatsappAudits(run.id)
    expect(audit?.details).toEqual({ mode: "simulated", reminder: true })
    await expectAppError(sendOfferWhatsApp(db, run.id, "de"), 409)
    expect(await whatsappAudits(run.id)).toHaveLength(1)
  })

  it("two clicks at once send one message", async () => {
    const run = await fibreRun()
    const results = await Promise.allSettled([
      sendOfferWhatsApp(db, run.id, "de"),
      sendOfferWhatsApp(db, run.id, "de"),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await whatsappAudits(run.id)).toHaveLength(1)
  })
})

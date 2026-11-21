import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { DB } from "@/lib/db"
import { newId } from "@/lib/ids"
import {
  findWhatsAppRun,
  getRunView,
  markOfferSent,
  triggerEvent,
} from "@/lib/workflow/engine"

import { closeDb, expectAppError, LENA, resetDb, UNIT_4B } from "./helpers"

vi.mock("server-only", () => ({}))
const { sendOfferWhatsApp, whatsappRecipient } =
  await import("@/lib/whatsapp/outbound")
const { applyOfferReply } = await import("@/lib/whatsapp/offer-agent")

const LENA_PHONE = "+49 172 8537122"
const PORTAL = "http://localhost:3000/de/portal/x"

let db: DB
beforeEach(async () => {
  db = await resetDb()
  delete process.env.WHATSAPP_OFFER_TEMPLATE
  delete process.env.DEMO_TENANT_PHONE_OVERRIDE
  delete process.env.DEMO_TENANT_NAME_OVERRIDE
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

const turn = (decision: "none" | "accept" | "decline", consent = false) => ({
  reply: "Agent reply",
  decision,
  consent_to_share_listed_data: consent,
  decline_reason: null,
})

describe("WhatsApp opener", () => {
  it("is the first contact: records the template text and moves to offer_sent", async () => {
    const run = await fibreRun()
    expect(await sendOfferWhatsApp(db, run.id)).toEqual({ mode: "simulated" })
    const view = await getRunView(db, run.id)
    expect(view.run.state).toBe("offer_sent")
    expect(view.audit.find((a) => a.toState === "offer_sent")?.details).toEqual(
      { channel: "whatsapp" }
    )
    expect(view.messages.at(-1)?.content).toBe(
      "Hallo Liam, hier ist Cora, die digitale Assistentin von reltix. Für Ihren Einzug am 1. Dezember 2026 in Musterstraße 12, 52062 Aachen habe ich ein Internet-Angebot für Sie. Antworten Sie einfach auf diese Nachricht, dann erkläre ich Ihnen alles."
    )
    const [audit] = await whatsappAudits(run.id)
    expect(audit?.costCents).toBeGreaterThan(0)
    // The number is stored only as a hash.
    expect(JSON.stringify(audit?.details)).not.toContain("8537122")
  })

  it("greets the presenter by name when they play the tenant", async () => {
    process.env.DEMO_TENANT_NAME_OVERRIDE = "Liam"
    const run = await fibreRun()
    await sendOfferWhatsApp(db, run.id)
    const view = await getRunView(db, run.id)
    expect(view.messages.at(-1)?.content).toMatch(/^Hallo Liam, hier ist Cora/)
  })

  it("sends one reminder after another channel, never a second message", async () => {
    const run = await fibreRun()
    await markOfferSent(db, run.id, { channel: "voice", actor: "ai" })
    await sendOfferWhatsApp(db, run.id)
    const [audit] = await whatsappAudits(run.id)
    expect((audit?.details as { reminder: boolean }).reminder).toBe(true)
    await expectAppError(sendOfferWhatsApp(db, run.id), 409)
    expect(await whatsappAudits(run.id)).toHaveLength(1)
  })

  it("two clicks at once send one message", async () => {
    const run = await fibreRun()
    const results = await Promise.allSettled([
      sendOfferWhatsApp(db, run.id),
      sendOfferWhatsApp(db, run.id),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await whatsappAudits(run.id)).toHaveLength(1)
  })
})

describe("replies reach the offer agent", () => {
  it("only from the number Cora wrote to, while the offer is open", async () => {
    const run = await fibreRun()
    expect(await findWhatsAppRun(db, whatsappRecipient(LENA_PHONE))).toBeNull()
    await sendOfferWhatsApp(db, run.id)
    // Meta reports the sender as bare digits.
    expect(await findWhatsAppRun(db, whatsappRecipient("491728537122"))).toBe(
      run.id
    )
    expect(
      await findWhatsAppRun(db, whatsappRecipient("+49 171 0000000"))
    ).toBeNull()
    await applyOfferReply(db, run.id, "Nein danke", turn("decline"), PORTAL)
    expect(await findWhatsAppRun(db, whatsappRecipient(LENA_PHONE))).toBeNull()
  })

  it("follows the demo phone override", async () => {
    process.env.DEMO_TENANT_PHONE_OVERRIDE = "+44 7700 900123"
    const run = await fibreRun()
    await sendOfferWhatsApp(db, run.id)
    expect(await findWhatsAppRun(db, whatsappRecipient("447700900123"))).toBe(
      run.id
    )
  })
})

describe("the agent's decision", () => {
  async function openRun() {
    const run = await fibreRun()
    await sendOfferWhatsApp(db, run.id)
    return run
  }

  it("orders only with consent to the listed details", async () => {
    const run = await openRun()
    const asked = await applyOfferReply(
      db,
      run.id,
      "Ja, bestellen",
      turn("accept", false),
      PORTAL
    )
    expect(asked.outcome).toBe("needs_consent")
    expect((await getRunView(db, run.id)).run.state).toBe("offer_sent")

    const done = await applyOfferReply(
      db,
      run.id,
      "Ja, das ist ok",
      turn("accept", true),
      PORTAL
    )
    expect(done).toEqual({ reply: "Agent reply", outcome: "ordered" })
    const view = await getRunView(db, run.id)
    expect(view.run.state).toBe("ordered")
    expect(view.consent?.channel).toBe("whatsapp")
    // The tenant's own words are in the workflow conversation, not a synthetic line.
    const tenantLines = view.messages
      .filter((m) => m.role === "tenant")
      .map((m) => m.content)
    expect(tenantLines).toEqual(["Ja, bestellen", "Ja, das ist ok"])
  })

  it("declines without sharing anything", async () => {
    const run = await openRun()
    const r = await applyOfferReply(
      db,
      run.id,
      "Nein, ich habe schon einen Vertrag",
      turn("decline"),
      PORTAL
    )
    expect(r.outcome).toBe("declined")
    const view = await getRunView(db, run.id)
    expect(view.run.state).toBe("declined")
    expect(view.order).toBeNull()
  })

  it("tells the tenant when the engine refuses instead of confirming", async () => {
    const run = await openRun()
    await applyOfferReply(db, run.id, "Nein", turn("decline"), PORTAL)
    const r = await applyOfferReply(
      db,
      run.id,
      "Doch, ja bitte",
      turn("accept", true),
      PORTAL
    )
    expect(r.outcome).toBe("none")
    expect(r.reply).toContain(PORTAL)
    expect((await getRunView(db, run.id)).run.state).toBe("declined")
  })
})

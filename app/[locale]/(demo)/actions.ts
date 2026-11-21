"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { demoOnly } from "@/lib/api"
import { getDb, type DB } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { simulatePartnerStatus, SimulatedStatus } from "@/lib/partner/simulator"
import { resetDemoData } from "@/lib/seed"
import { startCall } from "@/lib/voice/elevenlabs"
import { sendOfferWhatsApp } from "@/lib/whatsapp/outbound"
import {
  acceptOffer,
  declineOffer,
  detectMoveIn,
  markOfferSent,
  revokeConsent,
} from "@/lib/workflow/engine"

/*
 * Server Actions behind the demo screens. They call the same engine functions as the
 * HTTP API. Like the API routes they are reachable by direct POST and have no auth yet
 * (demo); every input is validated here or by the engine.
 */

export type ActionResult = { error: string | null }

async function run(fn: (db: DB) => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn(getDb())
  } catch (e) {
    if (e instanceof AppError) return { error: e.message }
    console.error("[demo action] unhandled error", e)
    return { error: "Something went wrong on our side." }
  }
  // Re-render the current page with the new state in the same round trip.
  refresh()
  return { error: null }
}

const Id = z.uuid()
const id = (v: unknown) => {
  const parsed = Id.safeParse(v)
  if (!parsed.success) throw new AppError("Invalid id.", 400, "bad_request")
  return parsed.data
}

export async function fireMoveInAction(unitId: string) {
  return run((db) => detectMoveIn(db, id(unitId)))
}

export async function resetDemoAction() {
  return run(async (db) => {
    demoOnly()
    await resetDemoData(db)
  })
}

export async function contactTenantAction(
  runId: string,
  channel: "voice" | "whatsapp" | "portal",
  locale = "de"
) {
  return run((db) => {
    if (channel === "voice") return startCall(db, id(runId))
    if (channel === "whatsapp")
      return sendOfferWhatsApp(db, id(runId), locale === "en" ? "en" : "de")
    // A person in centrix approved the suggested step.
    return markOfferSent(db, id(runId), {
      channel: "portal",
      actor: "property_manager",
    })
  })
}

export async function acceptOfferAction(runId: string) {
  return run((db) => acceptOffer(db, id(runId), { channel: "portal" }))
}

export async function declineOfferAction(runId: string) {
  return run((db) => declineOffer(db, id(runId), { channel: "portal" }))
}

export async function revokeConsentAction(runId: string) {
  return run((db) => revokeConsent(db, id(runId), { channel: "portal" }))
}

export async function partnerStatusAction(
  orderId: string,
  update: z.input<typeof SimulatedStatus>
) {
  return run(async (db) => {
    demoOnly()
    const parsed = SimulatedStatus.safeParse(update)
    if (!parsed.success)
      throw new AppError("Invalid status update.", 400, "bad_request")
    await simulatePartnerStatus(db, id(orderId), parsed.data)
  })
}

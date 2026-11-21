import "server-only"

import { createHash } from "node:crypto"

import { getUnitSnapshot } from "@/lib/centrix/repository"
import type { DB } from "@/lib/db"
import { greetingName } from "@/lib/demo"
import { AppError, unprocessable } from "@/lib/errors"
import { phoneDigits } from "@/lib/voice/caller"
import {
  claimWhatsAppMessage,
  COSTS,
  getRunView,
  recordWhatsAppFailure,
} from "@/lib/workflow/engine"

import { openerParams, renderOpener, templateLanguage } from "./template"

/*
 * Cora's first WhatsApp message about an offer. A business may only open a WhatsApp
 * conversation with a template Meta has approved, so this sends the short opener in
 * ./template.ts (WHATSAPP_OFFER_TEMPLATE). When the tenant replies, the Cora agent takes
 * over in free text (./offer-agent.ts): explains the offer, answers questions and asks
 * for consent. Only tenants who opted in to WhatsApp are messaged.
 *
 * Without credentials or a template the message is simulated, so the demo never
 * depends on Meta.
 */

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_OFFER_TEMPLATE
  )
}

/** Replies are matched to the run by this hash of the number, not the number itself. */
export function whatsappRecipient(phone: string) {
  return createHash("sha256")
    .update(`whatsapp:${phoneDigits(phone)}`)
    .digest("hex")
}

export async function sendOfferWhatsApp(db: DB, runId: string) {
  const view = await getRunView(db, runId)
  const snapshot = await getUnitSnapshot(db, view.run.unitId)
  const tenant = snapshot.tenant
  if (!tenant || tenant.contact_id !== view.run.partyId)
    throw unprocessable("this workflow's resident is not the unit's tenant")
  if (!tenant.whatsapp_opt_in)
    throw unprocessable("The tenant hasn't opted in to WhatsApp.")
  if (!view.offer) throw unprocessable("workflow has no offer to talk about")
  const to = process.env.DEMO_TENANT_PHONE_OVERRIDE || tenant.phone
  const live = whatsappConfigured()
  if (live && !to) throw unprocessable("tenant has no phone number on file")

  const language = templateLanguage(tenant.language)
  const params = openerParams({
    language,
    firstName: greetingName(tenant.name),
    moveIn: view.offer.target_date,
    address: snapshot.property.address,
    category: view.offer.category,
  })

  // Claim first: the lock and the one-message rule hold even if Meta is slow.
  await claimWhatsAppMessage(db, runId, {
    costCents: COSTS.whatsappTemplateCents,
    mode: live ? "live" : "simulated",
    message: renderOpener(language, params),
    recipient: to ? whatsappRecipient(to) : null,
  })
  if (!live) return { mode: "simulated" as const }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phoneDigits(to!),
          type: "template",
          template: {
            name: process.env.WHATSAPP_OFFER_TEMPLATE,
            language: { code: language },
            components: [
              {
                type: "body",
                parameters: params.map((text) => ({ type: "text", text })),
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    const body = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[]
      error?: { message?: string }
    }
    if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
    return { mode: "live" as const, message_id: body.messages?.[0]?.id }
  } catch (e) {
    await recordWhatsAppFailure(db, runId, (e as Error).message)
    throw new AppError(
      "The WhatsApp message couldn't be sent. The offer is waiting in the tenant portal instead.",
      502,
      "whatsapp_failed"
    )
  }
}

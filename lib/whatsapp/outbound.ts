import "server-only"

import { getUnitSnapshot } from "@/lib/centrix/repository"
import type { DB } from "@/lib/db"
import { AppError, unprocessable } from "@/lib/errors"
import { formatEur } from "@/lib/money"
import {
  claimWhatsAppMessage,
  COSTS,
  getRunView,
  recordWhatsAppFailure,
} from "@/lib/workflow/engine"

/*
 * The offer as a WhatsApp message. A business may only open a WhatsApp conversation with
 * a template Meta has approved, so this sends the template named in
 * WHATSAPP_OFFER_TEMPLATE with the offer as body parameters and the tenant's portal path
 * as the URL button: the tenant agrees in the portal, where consent is recorded for
 * exactly the fields shown. Only tenants who opted in to WhatsApp are messaged.
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

export async function sendOfferWhatsApp(db: DB, runId: string, locale: string) {
  const view = await getRunView(db, runId)
  const snapshot = await getUnitSnapshot(db, view.run.unitId)
  const tenant = snapshot.tenant
  if (!tenant || tenant.contact_id !== view.run.partyId)
    throw unprocessable("this workflow's resident is not the unit's tenant")
  if (!tenant.whatsapp_opt_in)
    throw unprocessable("The tenant hasn't opted in to WhatsApp.")
  const to = process.env.DEMO_TENANT_PHONE_OVERRIDE || tenant.phone
  const live = whatsappConfigured()
  if (live && !to) throw unprocessable("tenant has no phone number on file")

  // Claim first: the lock and the one-message rule hold even if Meta is slow.
  const { offer } = await claimWhatsAppMessage(db, runId, {
    costCents: COSTS.whatsappTemplateCents,
    mode: live ? "live" : "simulated",
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
          to: to!.replace(/[^\d+]/g, ""),
          type: "template",
          template: {
            name: process.env.WHATSAPP_OFFER_TEMPLATE,
            language: { code: tenant.language === "en" ? "en" : "de" },
            components: [
              {
                type: "body",
                parameters: [
                  tenant.name.split(" ")[0] ?? tenant.name,
                  offer.product,
                  offer.partner_name,
                  formatEur(offer.monthly_price_cents),
                  offer.start_date,
                ].map((text) => ({ type: "text", text })),
              },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                // The template's button URL ends in {{1}}: the portal path.
                parameters: [
                  {
                    type: "text",
                    text: `${locale}/portal/${tenant.contact_id}`,
                  },
                ],
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

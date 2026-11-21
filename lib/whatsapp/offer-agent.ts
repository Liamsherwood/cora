import "server-only"

import { generateText, tool, type ModelMessage } from "ai"
import { z } from "zod"

import { getUnitSnapshot } from "@/lib/centrix/repository"
import { coraPersonality } from "@/lib/cora"
import type { DB } from "@/lib/db"
import { greetingName } from "@/lib/demo"
import { AppError } from "@/lib/errors"
import { formatEur } from "@/lib/money"
import {
  acceptOffer,
  declineOffer,
  getRunView,
  recordWhatsAppTurn,
} from "@/lib/workflow/engine"
import { FIELD_LABELS } from "@/lib/workflow/minimize"

import { openerParams, renderOpener, templateLanguage } from "./template"

/*
 * The Cora agent on WhatsApp, once a tenant answers the opener about an offer. The model
 * holds the conversation: explains the offer, answers questions from the facts it is
 * given and asks for consent in its own words. It decides nothing by itself. Its
 * decision comes back as a tool call, and only code places the order: the engine checks
 * the state, the consent and the fields the tenant was shown, as for the portal and voice.
 */

const OfferReply = z.object({
  reply: z.string().trim().min(1).max(1200),
  decision: z.enum(["none", "accept", "decline"]),
  /** True only if the tenant agreed to share exactly the listed details, after seeing them. */
  consent_to_share_listed_data: z.boolean(),
  decline_reason: z.string().max(300).nullable(),
})

export type OfferReply = z.infer<typeof OfferReply>

const offerReply = tool({
  description:
    "Reply to the tenant on WhatsApp and report whether they decided on the offer.",
  inputSchema: OfferReply,
})

export type OfferOutcome = "none" | "ordered" | "declined" | "needs_consent"

/**
 * Applies the agent's turn. An order goes out only when the agent reports both the
 * decision and the consent; if the engine refuses, the tenant hears that instead of the
 * agent's confirmation. The exchange is mirrored into the workflow conversation.
 */
export async function applyOfferReply(
  db: DB,
  runId: string,
  tenantText: string,
  turn: OfferReply,
  portalUrl: string
): Promise<{ reply: string; outcome: OfferOutcome }> {
  let reply = turn.reply
  let outcome: OfferOutcome = "none"
  try {
    if (turn.decision === "accept" && turn.consent_to_share_listed_data) {
      await acceptOffer(db, runId, { channel: "whatsapp", transcript: false })
      outcome = "ordered"
    } else if (turn.decision === "accept") {
      outcome = "needs_consent"
    } else if (turn.decision === "decline") {
      await declineOffer(db, runId, {
        channel: "whatsapp",
        reason: turn.decline_reason ?? undefined,
        transcript: false,
      })
      outcome = "declined"
    }
  } catch (e) {
    if (!(e instanceof AppError)) throw e
    reply = `Das hat leider nicht geklappt. Ihr Angebot wartet im Portal: ${portalUrl}\n\nThat didn't work, sorry. Your offer is waiting in the portal: ${portalUrl}`
  }
  await recordWhatsAppTurn(db, runId, { tenant: tenantText, agent: reply })
  return { reply, outcome }
}

async function offerInstructions(db: DB, runId: string) {
  const view = await getRunView(db, runId)
  const o = view.offer
  if (!o) throw new AppError("workflow has no offer", 422, "unprocessable")
  const snapshot = await getUnitSnapshot(db, view.run.unitId)
  const language = templateLanguage(snapshot.tenant?.language)
  const firstName = greetingName(view.tenant?.name)
  const opener = renderOpener(
    language,
    openerParams({
      language,
      firstName,
      moveIn: o.target_date,
      address: snapshot.property.address,
      category: o.category,
    })
  )
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000"
  const portalUrl = `${base}/${language}/portal/${view.run.partyId}`
  const fields = o.required_context.map((f) => FIELD_LABELS[f]).join(", ")
  const timing = o.on_time
    ? `It can be live on the move-in day (${o.target_date}).`
    : `It cannot be live on the move-in day: the earliest activation is ${o.start_date}.${
        o.bridge
          ? ` Until then the tenant gets ${o.bridge.product} for free, delivered by ${o.bridge.ready_by}.`
          : ""
      }`

  const instructions = `${coraPersonality}

You are on WhatsApp with ${firstName || "the tenant"}, who is moving into ${snapshot.property.address}. centrix noticed the move-in and found an offer. You opened the chat with this message, and the tenant has now replied:
"${opener}"

Facts. Use only these. Never invent prices, dates, speeds or terms:
- Provider: ${o.partner_name}
- Product: ${o.product}${o.description ? ` (${o.description})` : ""}
- Price: ${formatEur(o.monthly_price_cents)} per month${o.one_time_fee_cents ? `, one-time fee ${formatEur(o.one_time_fee_cents)}` : ", no one-time fee"}, minimum term ${o.contract_months} months
- Timing: ${timing}
- To order, ${o.partner_name} receives exactly: ${fields}. Nothing else is shared. Rent, bank details and owner data are never shared.
- The tenant can also read and accept the offer in their portal: ${portalUrl}
- reltix is the property manager. The tenant is free to choose another provider.

How to talk:
- Keep messages short, like a WhatsApp chat. Plain text, no markdown headings. At most one question per message.
- If you have not presented the offer yet, do that first: product, price, timing, in two or three sentences.
- Answer questions from the facts. If the facts don't cover it, say so and that ${o.partner_name} or the property manager can answer it after ordering. Don't guess.
- Before ordering, list exactly what ${o.partner_name} will receive and ask whether that is OK.

Reporting the decision (use the offer_reply tool every time):
- decision "accept" with consent_to_share_listed_data true ONLY when the tenant clearly said yes to ordering AND to sharing the listed details, after you listed them in this chat. Then say you are placing the order and that updates follow here and in the portal.
- decision "accept" with consent_to_share_listed_data false when they want it but have not yet OK'd the details: list them and ask.
- decision "decline" only when they clearly say no. Say nothing was shared.
- Otherwise decision "none".`
  return { instructions, portalUrl }
}

/** One agent turn for a tenant who replied to an offer opener. */
export async function runOfferAgent(
  db: DB,
  runId: string,
  conversation: ModelMessage[],
  tenantText: string
) {
  const { instructions, portalUrl } = await offerInstructions(db, runId)
  const result = await generateText({
    model: process.env.WHATSAPP_AI_MODEL || "openai/gpt-5-mini",
    instructions,
    messages: conversation,
    tools: { offer_reply: offerReply },
    toolChoice: { type: "tool", toolName: "offer_reply" },
    maxOutputTokens: 900,
    reasoning: "minimal",
    timeout: 20_000,
    maxRetries: 0,
  })
  const turn = result.staticToolCalls.find(
    (call) => call.toolName === "offer_reply"
  )?.input
  if (!turn) throw new Error("offer agent returned no reply")
  return applyOfferReply(db, runId, tenantText, turn, portalUrl)
}

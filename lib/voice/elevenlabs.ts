import type { DB } from "@/lib/db"
import { getUnitSnapshot } from "@/lib/centrix/repository"
import { AppError, unprocessable } from "@/lib/errors"
import { formatEur } from "@/lib/money"
import {
  COSTS,
  getRunView,
  markOfferSent,
  offerSentence,
  recordCallFailure,
  setConversationThread,
} from "@/lib/workflow/engine"
import { FIELD_LABELS } from "@/lib/workflow/minimize"
import { getCaller, supportContext } from "@/lib/voice/caller"
import { moveInGreeting } from "@/lib/voice/greetings"
import { voiceMode, WEB_RINGING } from "@/lib/voice/mode"

/**
 * Outbound call through ElevenLabs Agents (Twilio number imported in the ElevenLabs
 * dashboard). The agent receives the context as dynamic variables – the "hand over
 * context" step – and reports the tenant's decision back through the server tool at
 * /api/voice/tools/decision.
 *
 * Without credentials the call is simulated, so the demo never depends on telephony.
 */

export function voiceConfigured(): boolean {
  return Boolean(
    process.env.ELEVENLABS_API_KEY &&
    process.env.ELEVENLABS_AGENT_ID &&
    process.env.ELEVENLABS_PHONE_NUMBER_ID
  )
}

export async function buildDynamicVariables(db: DB, runId: string) {
  const view = await getRunView(db, runId)
  const offer = view.offer
  if (!offer) throw unprocessable("workflow has no offer to talk about")
  const snapshot = await getUnitSnapshot(db, view.run.unitId)
  // The same agent also takes support calls: give it the caller context too, so the
  // tenant can ask about other things in the same call.
  const caller = snapshot.tenant
    ? await getCaller(db, snapshot.tenant.contact_id).catch(() => null)
    : null
  const support = await supportContext(db, caller)
  // Only what the agent needs to hold the conversation – no rent, no owner data.
  return {
    ...support,
    call_purpose: "move_in_offer",
    unit_id: view.run.unitId,
    workflow_id: runId,
    tenant_first_name: (snapshot.tenant?.name ?? "").split(" ")[0] ?? "",
    tenant_language: snapshot.tenant?.language ?? "de",
    address: snapshot.property.address,
    move_in_date: offer.target_date,
    partner_name: offer.partner_name,
    product: offer.product,
    monthly_price: formatEur(offer.monthly_price_cents),
    contract_months: String(offer.contract_months),
    start_date: offer.start_date,
    on_time: offer.on_time ? "yes" : "no",
    bridge_product: offer.bridge?.product ?? "",
    bridge_ready_by: offer.bridge?.ready_by ?? "",
    offer_summary: offerSentence(offer),
    data_to_share: offer.required_context
      .map((f) => FIELD_LABELS[f])
      .join(", "),
    property_manager: "reltix",
  }
}

export async function startCall(db: DB, runId: string) {
  const view = await getRunView(db, runId)
  if (view.run.state !== "detected") {
    throw new AppError(
      `call can only start from "detected" (now "${view.run.state}")`,
      409,
      "conflict"
    )
  }
  const snapshot = await getUnitSnapshot(db, view.run.unitId)
  const to = process.env.DEMO_TENANT_PHONE_OVERRIDE || snapshot.tenant?.phone
  const estimatedCost = Math.round(
    COSTS.voiceCentsPerMinute * COSTS.assumedCallMinutes
  )
  if (voiceConfigured() && !to)
    throw unprocessable("tenant has no phone number on file")
  const dynamicVariables = voiceConfigured()
    ? await buildDynamicVariables(db, runId)
    : null

  // Claim the run BEFORE dialling: the atomic state change means two clicks can never
  // ring the tenant twice. The offer is in the portal from this moment on, so a failed
  // call still leaves the tenant a way to answer.
  // No phone number but an agent: ring the tenant in the portal (browser call).
  const mode = voiceMode()
  await markOfferSent(db, runId, {
    channel: "voice",
    actor: "ai",
    costCents: estimatedCost,
    externalThreadId:
      mode === "phone" ? "pending" : mode === "web" ? WEB_RINGING : "simulated",
  })
  if (mode === "web") return { mode: "web" as const }
  if (mode !== "phone") return { mode: "simulated" as const }

  try {
    const res = await fetch(
      "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agent_id: process.env.ELEVENLABS_AGENT_ID,
          agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
          to_number: to!.replace(/\s+/g, ""),
          conversation_initiation_client_data: {
            dynamic_variables: dynamicVariables,
            conversation_config_override: {
              agent: {
                language:
                  dynamicVariables!.tenant_language === "de" ? "de" : "en",
                first_message: moveInGreeting(
                  dynamicVariables!.tenant_language,
                  dynamicVariables!.tenant_first_name,
                  dynamicVariables!.move_in_date
                ),
              },
            },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean
      conversation_id?: string
      message?: string
    }
    if (!res.ok || body.success === false)
      throw new Error(body.message ?? `HTTP ${res.status}`)
    await setConversationThread(db, runId, body.conversation_id ?? null)
    return {
      mode: "live" as const,
      conversation_id: body.conversation_id ?? null,
    }
  } catch (e) {
    await recordCallFailure(db, runId, (e as Error).message)
    throw new AppError(
      "The call couldn't be placed. The offer is waiting in the tenant portal instead.",
      502,
      "voice_failed"
    )
  }
}

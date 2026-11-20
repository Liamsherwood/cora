import type { DB } from "@/db/client";
import { getUnitSnapshot } from "@/centrix/repository";
import { AppError, unprocessable } from "@/lib/errors";
import { COSTS, getRunView, markOfferSent, offerSentence, recordCallFailure, setConversationThread } from "@/workflow/engine";
import { FIELD_LABELS } from "@/workflow/minimize";
import { formatEur } from "@/workflow/offers";

/**
 * Outbound call through ElevenLabs Agents (Twilio number imported in the ElevenLabs dashboard).
 * The agent receives the full context as dynamic variables – the "hand over context" step –
 * and reports the tenant's decision back through the server tool at /api/voice/tools/decision.
 *
 * Without credentials the call is simulated, so the demo never depends on telephony.
 */

export function voiceConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID && process.env.ELEVENLABS_PHONE_NUMBER_ID);
}

export async function buildDynamicVariables(db: DB, runId: string) {
  const view = await getRunView(db, runId);
  const offer = view.offer;
  if (!offer) throw unprocessable("workflow has no offer to talk about");
  const snapshot = await getUnitSnapshot(db, view.run.unitId);
  // Only what the agent needs to hold the conversation – no rent, no owner data.
  return {
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
    data_to_share: offer.required_context.map((f) => FIELD_LABELS[f]).join(", "),
    property_manager: "reltix",
  };
}

export async function startCall(db: DB, runId: string) {
  const view = await getRunView(db, runId);
  if (view.run.state !== "detected") {
    throw new AppError(`call can only start from "detected" (now "${view.run.state}")`, 409, "conflict");
  }
  const snapshot = await getUnitSnapshot(db, view.run.unitId);
  const to = process.env.DEMO_TENANT_PHONE_OVERRIDE || snapshot.tenant?.phone;
  const estimatedCost = Math.round(COSTS.voiceCentsPerMinute * COSTS.assumedCallMinutes);
  if (voiceConfigured() && !to) throw unprocessable("tenant has no phone number on file");
  const dynamicVariables = voiceConfigured() ? await buildDynamicVariables(db, runId) : null;

  // Claim the run BEFORE dialling: the atomic state change means two clicks can never ring the
  // tenant twice. The offer is in the portal from this moment on, so a failed call still leaves
  // the tenant a way to answer.
  await markOfferSent(db, runId, { channel: "voice", actor: "ai", costCents: estimatedCost, externalThreadId: voiceConfigured() ? "pending" : "simulated" });
  if (!voiceConfigured()) return { mode: "simulated" as const };

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify({
        agent_id: process.env.ELEVENLABS_AGENT_ID,
        agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
        to_number: to!.replace(/\s+/g, ""),
        conversation_initiation_client_data: { dynamic_variables: dynamicVariables },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; conversation_id?: string; message?: string };
    if (!res.ok || body.success === false) throw new Error(body.message ?? `HTTP ${res.status}`);
    await setConversationThread(db, runId, body.conversation_id ?? null);
    return { mode: "live" as const, conversation_id: body.conversation_id ?? null };
  } catch (e) {
    await recordCallFailure(db, runId, (e as Error).message);
    throw new AppError("The call couldn't be placed. The offer is waiting in the tenant portal instead.", 502, "voice_failed");
  }
}

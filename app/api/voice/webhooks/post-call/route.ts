import { handle } from "@/lib/api"
import * as t from "@/lib/db/schema"
import { AppError } from "@/lib/errors"
import { isUuid, nameUuid } from "@/lib/ids"
import { verifyElevenLabsSignature } from "@/lib/voice/auth"

type PostCall = {
  type?: string
  event_timestamp?: number
  data?: {
    conversation_id?: string
    status?: string
    metadata?: { call_duration_secs?: number }
    analysis?: { transcript_summary?: string; call_successful?: string }
    conversation_initiation_client_data?: {
      dynamic_variables?: Record<string, unknown>
    }
  }
}

/**
 * ElevenLabs post-call webhook (`post_call_transcription`). Closes the loop: the call's
 * summary lands on the unit as a `call.completed` event, so the property manager sees
 * it and the agent can pick up from it on the next call. Signed with
 * ELEVENLABS_WEBHOOK_SECRET; repeated deliveries of one call are stored once.
 */
export async function POST(req: Request) {
  return handle(async (db) => {
    const raw = await req.text()
    verifyElevenLabsSignature(
      req.headers.get("elevenlabs-signature"),
      raw,
      process.env.ELEVENLABS_WEBHOOK_SECRET
    )
    let body: PostCall
    try {
      body = JSON.parse(raw) as PostCall
    } catch {
      throw new AppError("body must be valid JSON", 400, "bad_request")
    }
    if (body.type !== "post_call_transcription")
      return { stored: false, reason: "ignored type" }

    const d = body.data ?? {}
    const vars = d.conversation_initiation_client_data?.dynamic_variables ?? {}
    const unitId = String(vars.unit_id ?? "")
    const partyId = String(vars.party_id ?? "")
    if (!d.conversation_id || !isUuid(unitId))
      return { stored: false, reason: "call not linked to a unit" }

    await db
      .insert(t.events)
      .values({
        id: nameUuid(`elevenlabs-call:${d.conversation_id}`),
        type: "call.completed",
        unitId,
        partyId: isUuid(partyId) ? partyId : null,
        occurredAt: new Date(
          (body.event_timestamp ?? Date.now() / 1000) * 1000
        ),
        payload: {
          conversation_id: d.conversation_id,
          purpose: String(vars.call_purpose ?? "support"),
          summary: d.analysis?.transcript_summary ?? "",
          call_successful: d.analysis?.call_successful ?? null,
          duration_secs: d.metadata?.call_duration_secs ?? null,
          ...(vars.workflow_id
            ? { workflow_id: String(vars.workflow_id) }
            : {}),
        },
      })
      .onConflictDoNothing()
    return { stored: true }
  })
}

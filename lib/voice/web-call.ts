import { and, eq } from "drizzle-orm"

import type { DB } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { AppError, conflict } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { buildDynamicVariables } from "@/lib/voice/elevenlabs"
import { moveInGreeting } from "@/lib/voice/greetings"
import { voiceMode, WEB_RINGING } from "@/lib/voice/mode"
import { getRunView } from "@/lib/workflow/engine"

/**
 * Browser call: when there is no phone number in ElevenLabs, "Call tenant" rings the
 * tenant in the portal instead of on the phone. The tenant answers there and talks to
 * the same agent, with the same context and tools as on a phone call.
 *
 *   detected ──Call tenant──▶ offer_sent, thread "web-ringing"
 *            ──Answer──▶ signed ElevenLabs session ──connected──▶ thread = conversation id
 *
 * Binding the real conversation id keeps the decision tool's guarantee: only the call
 * we placed for this workflow can accept or decline it.
 */

export { voiceMode, WEB_RINGING } from "@/lib/voice/mode"

async function threadOf(db: DB, runId: string): Promise<string | null> {
  if (!isUuid(runId)) return null
  const [conv] = await db
    .select({ thread: t.conversations.externalThreadId })
    .from(t.conversations)
    .where(eq(t.conversations.workflowRunId, runId))
  return conv?.thread ?? null
}

/** "ringing" before the tenant answers, "connected" once a browser call is bound. */
export async function webCallState(
  db: DB,
  runId: string
): Promise<"ringing" | "connected" | null> {
  if (voiceMode() !== "web") return null
  const thread = await threadOf(db, runId)
  if (thread === WEB_RINGING) return "ringing"
  if (thread && thread !== "pending" && thread !== "simulated")
    return "connected"
  return null
}

/** The tenant pressed "Answer": a one-time signed session for the ElevenLabs agent. */
export async function answerWebCall(db: DB, runId: string) {
  if (voiceMode() !== "web")
    throw new AppError("browser calls are not enabled", 409, "conflict")
  const view = await getRunView(db, runId)
  if (view.run.state !== "offer_sent")
    throw conflict(`nothing to talk about (state "${view.run.state}")`)
  if ((await threadOf(db, runId)) !== WEB_RINGING)
    throw conflict("this call was already answered")

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(process.env.ELEVENLABS_AGENT_ID!)}`,
    {
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    }
  )
  const body = (await res.json().catch(() => ({}))) as {
    signed_url?: string
    detail?: unknown
  }
  if (!res.ok || !body.signed_url) {
    console.error("[voice] signed url failed", res.status)
    throw new AppError(
      "The call couldn't be connected. You can still answer right here in the portal.",
      502,
      "voice_failed"
    )
  }
  const vars = await buildDynamicVariables(db, runId)
  return {
    signed_url: body.signed_url,
    dynamic_variables: vars,
    language: vars.tenant_language === "de" ? "de" : "en",
    first_message: moveInGreeting(
      vars.tenant_language,
      vars.tenant_first_name,
      vars.move_in_date
    ),
  }
}

/** The browser session is up: bind its conversation id to the workflow (once). */
export async function bindWebCall(
  db: DB,
  runId: string,
  conversationId: string
) {
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(conversationId))
    throw new AppError("invalid conversation id", 400, "bad_request")
  const thread = await threadOf(db, runId)
  if (thread === conversationId) return { bound: true }
  if (thread !== WEB_RINGING) throw conflict("this call was already answered")
  const updated = await db
    .update(t.conversations)
    .set({ externalThreadId: conversationId })
    .where(
      and(
        eq(t.conversations.workflowRunId, runId),
        eq(t.conversations.externalThreadId, WEB_RINGING)
      )
    )
    .returning({ id: t.conversations.id })
  // Two tabs answering at once: only the first bind wins.
  if (!updated.length) throw conflict("this call was already answered")
  return { bound: true }
}

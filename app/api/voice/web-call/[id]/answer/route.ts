import { handle } from "@/lib/api"
import { notFound } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { answerWebCall } from "@/lib/voice/web-call"

/**
 * The tenant answers Cora's call in the portal. Returns a one-time signed ElevenLabs
 * session plus the call context; the API key never leaves the server.
 * Demo: no auth, like the portal itself (production: signed portal links).
 */
export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/voice/web-call/[id]/answer">
) {
  const { id } = await ctx.params
  return handle(async (db) => {
    if (!isUuid(id)) throw notFound("workflow")
    return answerWebCall(db, id)
  })
}

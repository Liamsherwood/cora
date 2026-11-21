import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { notFound } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { bindWebCall } from "@/lib/voice/web-call"

const Body = z.object({ conversation_id: z.string().min(6).max(100) }).strict()

/**
 * The browser session is connected: tie its ElevenLabs conversation id to the
 * workflow, so the decision tool accepts this call (and only this one).
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/voice/web-call/[id]/connected">
) {
  const { id } = await ctx.params
  return handle(async (db) => {
    if (!isUuid(id)) throw notFound("workflow")
    const b = await parseBody(req, Body)
    return bindWebCall(db, id, b.conversation_id)
  })
}

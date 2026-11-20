import { handle } from "@/lib/api"
import { buildDynamicVariables } from "@/lib/voice/elevenlabs"

/** Dynamic variables for the in-portal ElevenLabs widget (same context as the phone call). */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/voice/context/[id]">
) {
  const { id } = await ctx.params
  return handle((db) => buildDynamicVariables(db, id))
}

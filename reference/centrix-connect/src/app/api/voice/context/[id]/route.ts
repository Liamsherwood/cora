import { handle } from "@/lib/api";
import { buildDynamicVariables } from "@/voice/elevenlabs";

export const dynamic = "force-dynamic";

/** Dynamic variables for the in-portal ElevenLabs widget (same context as the phone call). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((db) => buildDynamicVariables(db, id));
}

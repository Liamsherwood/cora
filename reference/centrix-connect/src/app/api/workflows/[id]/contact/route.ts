import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { markOfferSent } from "@/workflow/engine";
import { startCall } from "@/voice/elevenlabs";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    channel: z.enum(["voice", "portal"]),
    /** "property_manager" when a human approved the suggested step in centrix. */
    approved_by: z.enum(["system", "property_manager"]).default("system"),
  })
  .strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async (db) => {
    const b = await parseBody(req, Body);
    if (b.channel === "voice") {
      const result = await startCall(db, id);
      return { ok: true, ...result };
    }
    await markOfferSent(db, id, { channel: "portal", actor: b.approved_by === "property_manager" ? "property_manager" : "system" });
    return { ok: true, mode: "portal" };
  });
}

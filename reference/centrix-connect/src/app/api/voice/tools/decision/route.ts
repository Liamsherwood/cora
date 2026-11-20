import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { acceptOffer, declineOffer, voiceThreadMatches } from "@/workflow/engine";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    workflow_id: z.string().min(1),
    /** ElevenLabs system variable {{system__conversation_id}} – ties the decision to our call. */
    conversation_id: z.string().optional(),
    decision: z.enum(["accept", "decline"]),
    consent_confirmed: z.boolean(),
    reason: z.string().max(300).optional(),
  })
  .strict();

function secretOk(given: string | null): boolean {
  const expected = process.env.VOICE_TOOL_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * ElevenLabs server tool. The agent calls this when the tenant decides on the phone.
 * Configure in ElevenLabs: POST <APP_BASE_URL>/api/voice/tools/decision, header x-tool-secret.
 */
export async function POST(req: Request) {
  return handle(async (db) => {
    if (!secretOk(req.headers.get("x-tool-secret"))) throw new AppError("invalid tool secret", 401, "unauthorized");
    const b = await parseBody(req, Body);
    if (!(await voiceThreadMatches(db, b.workflow_id, b.conversation_id))) {
      throw new AppError("this call does not belong to that workflow", 403, "forbidden");
    }
    if (b.decision === "decline") {
      await declineOffer(db, b.workflow_id, { channel: "voice", reason: b.reason });
      return { ok: true, say: "Understood. Nothing was shared with the provider." };
    }
    if (!b.consent_confirmed) {
      // The agent must ask explicitly before ordering – no consent, no order.
      return { ok: false, say: "Before I can order, I need your OK to share the listed details with the provider." };
    }
    const r = await acceptOffer(db, b.workflow_id, { channel: "voice" });
    return { ok: true, order_id: r.order_id, say: "Done. I've placed the order – you'll get updates in your tenant portal." };
  });
}

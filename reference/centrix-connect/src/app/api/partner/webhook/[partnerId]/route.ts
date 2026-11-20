import { handle } from "@/lib/api";
import { handlePartnerWebhook } from "@/partner/webhook";
import { SIGNATURE_HEADER } from "@/partner/signature";

export const dynamic = "force-dynamic";

/** Partner -> centrix status updates. Signed with HMAC-SHA256 over the raw body. */
export async function POST(req: Request, ctx: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await ctx.params;
  // Read the raw text once: the signature covers the exact bytes, not a re-serialised object.
  const raw = await req.text();
  return handle((db) => handlePartnerWebhook(db, partnerId, raw, req.headers.get(SIGNATURE_HEADER)));
}

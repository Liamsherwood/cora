import { handle } from "@/lib/api"
import { SIGNATURE_HEADER } from "@/lib/partner/signature"
import { handlePartnerWebhook } from "@/lib/partner/webhook"

/**
 * Partner -> centrix status updates, signed with HMAC-SHA256 over the raw body.
 * partnerId in the URL is the partner's manifest id, e.g. /api/partner/webhook/example_fibre.
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/partner/webhook/[partnerId]">
) {
  const { partnerId } = await ctx.params
  // Read the raw text once: the signature covers the exact bytes, not a re-serialised object.
  const raw = await req.text()
  return handle((db) =>
    handlePartnerWebhook(db, partnerId, raw, req.headers.get(SIGNATURE_HEADER))
  )
}

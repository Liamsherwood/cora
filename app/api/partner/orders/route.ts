import { handle } from "@/lib/api"
import { AppError } from "@/lib/errors"
import { listPartnerFeed } from "@/lib/partner/feed"

/** Partner dashboard feed: what each partner received (consented fields only). */
export async function GET(req: Request) {
  // partner_id = the partner's manifest id, e.g. "example_fibre".
  const partnerSlug =
    new URL(req.url).searchParams.get("partner_id") ?? undefined
  return handle(async (db) => {
    // Outside the demo a partner must only ever see its own orders.
    // (Production: derive the partner from a per-partner API key instead of a query param.)
    if (process.env.DEMO_MODE !== "true" && !partnerSlug)
      throw new AppError("partner_id is required", 400, "bad_request")
    return listPartnerFeed(db, partnerSlug)
  })
}

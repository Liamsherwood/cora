import { handle } from "@/lib/api"
import { listPartners } from "@/lib/connectors/registry"
import { AppError } from "@/lib/errors"
import { listPartnerOrders } from "@/lib/workflow/engine"

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
    const [rows, registered] = await Promise.all([
      listPartnerOrders(db, partnerSlug),
      listPartners(db),
    ])
    const statuses = new Map(
      registered.map((p) => [p.slug, p.manifest.status_updates.statuses])
    )
    return rows.map((r) => ({
      id: r.order.id,
      partner_id: r.partnerSlug,
      partner_name: r.partnerName,
      product: r.product,
      statuses: statuses.get(r.partnerSlug) ?? [],
      status: r.order.status,
      start_date: r.order.startDate,
      created_at: r.order.createdAt,
      // Consent withdrawn -> the partner no longer sees the tenant's data.
      received: r.consentRevokedAt
        ? { redacted: "consent withdrawn by tenant" }
        : r.order.sharedPayload,
    }))
  })
}

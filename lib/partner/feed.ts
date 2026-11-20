import type { DB } from "@/lib/db"
import { listPartners } from "@/lib/connectors/registry"
import { listPartnerOrders } from "@/lib/workflow/engine"

/** One order as the partner sees it: consented fields only, redacted once consent is withdrawn. */
export type PartnerOrder = Awaited<ReturnType<typeof listPartnerFeed>>[number]

/** The partner dashboard feed. `partnerSlug` limits it to one partner's orders. */
export async function listPartnerFeed(db: DB, partnerSlug?: string) {
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
    received: r.consentRevokedAt
      ? { redacted: "consent withdrawn by tenant" }
      : (r.order.sharedPayload as Record<string, unknown>),
  }))
}

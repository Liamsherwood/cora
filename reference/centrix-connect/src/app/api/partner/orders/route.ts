import { handle } from "@/lib/api";
import { listPartnerOrders } from "@/workflow/engine";
import { listManifests } from "@/connectors/registry";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Partner dashboard feed: what each partner received (consented fields only). */
export async function GET(req: Request) {
  const partnerId = new URL(req.url).searchParams.get("partner_id") ?? undefined;
  return handle(async (db) => {
    // Outside the demo a partner must only ever see its own orders.
    // (Production: derive partner_id from a per-partner API key instead of a query param.)
    if (process.env.DEMO_MODE !== "true" && !partnerId) throw new AppError("partner_id is required", 400, "bad_request");
    const [rows, manifests] = await Promise.all([listPartnerOrders(db, partnerId), listManifests(db)]);
    const statuses = new Map(manifests.map((m) => [m.id, m.status_updates.statuses]));
    return rows.map((r) => ({
      statuses: statuses.get(r.order.partnerId) ?? [],
      id: r.order.id,
      partner_id: r.order.partnerId,
      partner_name: r.partnerName,
      status: r.order.status,
      start_date: r.order.startDate,
      created_at: r.order.createdAt,
      // Consent withdrawn -> the partner no longer sees the tenant's data.
      received: r.consentRevokedAt ? { redacted: "consent withdrawn by tenant" } : r.order.sharedPayload,
    }));
  });
}

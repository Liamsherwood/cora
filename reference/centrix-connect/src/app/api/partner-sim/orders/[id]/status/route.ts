import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { demoOnly, handle, parseBody } from "@/lib/api";
import { serviceOrders } from "@/db/schema";
import { PARTNER_STATUSES } from "@/connectors/spec";
import { AppError } from "@/lib/errors";
import { nowIso } from "@/lib/time";
import { handlePartnerWebhook } from "@/partner/webhook";
import { partnerSecret, sign } from "@/partner/signature";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    status: z.enum(PARTNER_STATUSES),
    activation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

/**
 * DEMO ONLY – plays the partner's backend: builds the status update, signs it with the
 * partner's secret and pushes it through exactly the same verification path as a real webhook.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async (db) => {
    demoOnly();
    const b = await parseBody(req, Body);
    const [order] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, id));
    if (!order) throw new AppError(`order ${id} not found`, 404, "not_found");
    const raw = JSON.stringify({ order_id: id, event_id: randomUUID(), occurred_at: nowIso(), ...b });
    return handlePartnerWebhook(db, order.partnerId, raw, sign(partnerSecret(order.partnerId), raw));
  });
}

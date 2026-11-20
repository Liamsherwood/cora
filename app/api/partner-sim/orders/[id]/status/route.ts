import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { z } from "zod"

import { demoOnly, handle, parseBody } from "@/lib/api"
import { PARTNER_STATUSES } from "@/lib/connectors/spec"
import { partners, serviceOrders } from "@/lib/db/schema"
import { AppError } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { partnerSecret, sign } from "@/lib/partner/signature"
import { handlePartnerWebhook } from "@/lib/partner/webhook"

const Body = z
  .object({
    status: z.enum(PARTNER_STATUSES),
    activation_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    note: z.string().max(500).optional(),
  })
  .strict()

/**
 * DEMO ONLY – plays the partner's backend: builds the status update, signs it with the
 * partner's secret and pushes it through exactly the same verification path as a real webhook.
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/partner-sim/orders/[id]/status">
) {
  const { id } = await ctx.params
  return handle(async (db) => {
    demoOnly()
    const b = await parseBody(req, Body)
    if (!isUuid(id))
      throw new AppError(`order ${id} not found`, 404, "not_found")
    const [order] = await db
      .select({ slug: partners.slug })
      .from(serviceOrders)
      .innerJoin(partners, eq(serviceOrders.partnerId, partners.id))
      .where(eq(serviceOrders.id, id))
    if (!order) throw new AppError(`order ${id} not found`, 404, "not_found")
    const raw = JSON.stringify({
      order_id: id,
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      ...b,
    })
    return handlePartnerWebhook(
      db,
      order.slug,
      raw,
      sign(partnerSecret(order.slug), raw)
    )
  })
}

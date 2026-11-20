import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { z } from "zod"

import type { DB } from "@/lib/db"
import { PARTNER_STATUSES } from "@/lib/connectors/spec"
import { partners, serviceOrders } from "@/lib/db/schema"
import { notFound } from "@/lib/errors"
import { isUuid } from "@/lib/ids"

import { partnerSecret, sign } from "./signature"
import { handlePartnerWebhook } from "./webhook"

export const SimulatedStatus = z
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
 * DEMO ONLY – plays the partner's backend: builds the status update, signs it with that
 * partner's secret and pushes it through exactly the same verification path as a real webhook.
 */
export async function simulatePartnerStatus(
  db: DB,
  orderId: string,
  update: z.infer<typeof SimulatedStatus>
) {
  if (!isUuid(orderId)) throw notFound(`order ${orderId}`)
  const [order] = await db
    .select({ slug: partners.slug })
    .from(serviceOrders)
    .innerJoin(partners, eq(serviceOrders.partnerId, partners.id))
    .where(eq(serviceOrders.id, orderId))
  if (!order) throw notFound(`order ${orderId}`)
  const raw = JSON.stringify({
    order_id: orderId,
    event_id: randomUUID(),
    occurred_at: new Date().toISOString(),
    ...update,
  })
  return handlePartnerWebhook(
    db,
    order.slug,
    raw,
    sign(partnerSecret(order.slug), raw)
  )
}

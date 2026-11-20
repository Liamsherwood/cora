import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { TRIGGERS } from "@/connectors/spec";
import { triggerEvent } from "@/workflow/engine";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{4,64}$/).optional(),
    event: z.enum(TRIGGERS),
    unit_id: z.string().min(1),
    contact_id: z.string().min(1).optional(),
    occurred_at: z.string().datetime({ offset: true }).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    partner_ids: z.array(z.string()).min(1).optional(),
  })
  .strict();

/** Same shape as the reltix example trigger: { event, occurred_at, unit_id, contact_id, data }. */
export async function POST(req: Request) {
  return handle(async (db) => {
    const b = await parseBody(req, Body);
    return triggerEvent(db, {
      id: b.id,
      type: b.event,
      unit_id: b.unit_id,
      party_id: b.contact_id,
      occurred_at: b.occurred_at,
      payload: b.data,
      partner_ids: b.partner_ids,
    });
  }, 201);
}

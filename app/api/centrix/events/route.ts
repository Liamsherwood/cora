import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { TRIGGERS } from "@/lib/connectors/spec"
import { triggerEvent } from "@/lib/workflow/engine"

const Body = z
  .object({
    /** Optional event id (uuid). Sending the same id twice returns the existing runs. */
    id: z.uuid().optional(),
    event: z.enum(TRIGGERS),
    unit_id: z.uuid(),
    contact_id: z.uuid().optional(),
    occurred_at: z.iso.datetime({ offset: true }).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    /** Restrict to these partners (manifest ids, e.g. "example_fibre"). */
    partner_ids: z.array(z.string()).min(1).optional(),
  })
  .strict()

/** Same shape as the reltix example trigger: { event, occurred_at, unit_id, contact_id, data }. */
export async function POST(req: Request) {
  return handle(async (db) => {
    const b = await parseBody(req, Body)
    return triggerEvent(db, {
      id: b.id,
      type: b.event,
      unit_id: b.unit_id,
      party_id: b.contact_id,
      occurred_at: b.occurred_at,
      payload: b.data,
      partner_slugs: b.partner_ids,
    })
  }, 201)
}

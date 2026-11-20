import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { SHAREABLE_FIELDS } from "@/lib/connectors/spec"
import { acceptOffer } from "@/lib/workflow/engine"

const Body = z
  .object({
    channel: z.enum(["portal", "email", "whatsapp"]).default("portal"),
    consent: z.literal(true, { message: "explicit consent is required" }),
    fields: z.array(z.enum(SHAREABLE_FIELDS)).optional(),
  })
  .strict()

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/workflows/[id]/accept">
) {
  const { id } = await ctx.params
  return handle(async (db) => {
    const b = await parseBody(req, Body)
    return acceptOffer(db, id, { channel: b.channel, fields: b.fields })
  })
}

import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { declineOffer } from "@/lib/workflow/engine"

const Body = z
  .object({
    channel: z.enum(["portal", "email", "whatsapp"]).default("portal"),
    reason: z.string().max(300).optional(),
  })
  .strict()

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/workflows/[id]/decline">
) {
  const { id } = await ctx.params
  return handle(async (db) => {
    const b = await parseBody(req, Body)
    await declineOffer(db, id, b)
    return { ok: true }
  })
}

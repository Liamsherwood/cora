import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { revokeConsent } from "@/lib/workflow/engine"

const Body = z
  .object({
    channel: z.enum(["portal", "email", "whatsapp"]).default("portal"),
  })
  .strict()

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/workflows/[id]/revoke-consent">
) {
  const { id } = await ctx.params
  return handle(async (db) => revokeConsent(db, id, await parseBody(req, Body)))
}

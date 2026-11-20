import { handle } from "@/lib/api"
import { getRunView } from "@/lib/workflow/engine"

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/workflows/[id]">
) {
  const { id } = await ctx.params
  return handle((db) => getRunView(db, id))
}

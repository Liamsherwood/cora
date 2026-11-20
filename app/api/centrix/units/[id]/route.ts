import { handle } from "@/lib/api"
import { getUnitSnapshot } from "@/lib/centrix/repository"
import { listRuns } from "@/lib/workflow/engine"

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/centrix/units/[id]">
) {
  const { id } = await ctx.params
  return handle(async (db) => ({
    snapshot: await getUnitSnapshot(db, id),
    workflows: await listRuns(db, { unitId: id }),
  }))
}

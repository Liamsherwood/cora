import { demoOnly, handle, parseBody } from "@/lib/api"
import { simulatePartnerStatus, SimulatedStatus } from "@/lib/partner/simulator"

/** DEMO ONLY – the partner's backend sends a signed status webhook for this order. */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/partner-sim/orders/[id]/status">
) {
  const { id } = await ctx.params
  return handle(async (db) => {
    demoOnly()
    return simulatePartnerStatus(db, id, await parseBody(req, SimulatedStatus))
  })
}

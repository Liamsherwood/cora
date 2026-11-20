import { handle } from "@/lib/api";
import { getUnitSnapshot } from "@/centrix/repository";
import { listRuns } from "@/workflow/engine";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async (db) => ({ snapshot: await getUnitSnapshot(db, id), workflows: await listRuns(db, { unitId: id }) }));
}

import { handle } from "@/lib/api";
import { getRunView } from "@/workflow/engine";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle((db) => getRunView(db, id));
}

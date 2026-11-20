import { handle } from "@/lib/api";
import { listRuns } from "@/workflow/engine";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  return handle((db) =>
    listRuns(db, { partyId: url.searchParams.get("party_id") ?? undefined, unitId: url.searchParams.get("unit_id") ?? undefined }),
  );
}

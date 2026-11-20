import { handle } from "@/lib/api";
import { listUnits } from "@/centrix/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle((db) => listUnits(db));
}

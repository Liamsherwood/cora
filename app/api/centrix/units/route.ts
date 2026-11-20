import { handle } from "@/lib/api"
import { listUnits } from "@/lib/centrix/repository"

export async function GET() {
  return handle((db) => listUnits(db))
}

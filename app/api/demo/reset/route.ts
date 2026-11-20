import { demoOnly, handle } from "@/lib/api"
import { resetDemoData } from "@/lib/seed"

/**
 * DEMO ONLY: clears the demo's workflows on the seed units and restores the seed rows.
 * No table is truncated and no other data is touched.
 */
export async function POST() {
  return handle(async (db) => {
    demoOnly()
    await resetDemoData(db)
    return { ok: true }
  })
}

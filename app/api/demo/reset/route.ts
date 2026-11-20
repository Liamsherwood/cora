import { demoOnly, handle } from "@/lib/api"
import { readSeedFile, seedDatabase, wipeDatabase } from "@/lib/seed"

/** DEMO ONLY: wipe every table and load the seed again. */
export async function POST() {
  return handle(async (db) => {
    demoOnly()
    const data = await readSeedFile()
    await wipeDatabase(db)
    await seedDatabase(db, data)
    return { ok: true }
  })
}

/**
 * Seeds the database in DATABASE_URL from data/seed.json + data/partners/*.json.
 *
 *   npm run db:migrate          # create tables
 *   npm run db:seed             # write the seed rows (idempotent upsert) and partners
 *   npm run db:seed -- --reset  # also clear the demo's workflows on the seed units
 *
 * Runs with the react-server condition so lib/db's "server-only" guard resolves.
 */
import nextEnv from "@next/env"

import { connect } from "@/lib/db"
import { readSeedFile, resetDemoData, seedDatabase } from "@/lib/seed"

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error("Set DATABASE_URL (see .env.example).")
  const db = connect(url, 1)
  try {
    const data = await readSeedFile()
    if (process.argv.includes("--reset")) {
      await resetDemoData(db, data)
      console.log("Demo workflows cleared and seed data restored.")
    } else {
      await seedDatabase(db, data)
      console.log("Seed data written.")
    }
  } finally {
    await db.$client.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

/**
 * Seeds the database in DATABASE_URL from data/seed.json + data/partners/*.json.
 *
 *   npm run db:migrate          # create tables
 *   npm run db:seed             # load demo data (skipped if data already exists)
 *   npm run db:seed -- --reset  # wipe all rows first
 *
 * Runs with the react-server condition so lib/db's "server-only" guard resolves.
 */
import nextEnv from "@next/env"

import { connect } from "@/lib/db"
import {
  readSeedFile,
  seedDatabase,
  seedIfEmpty,
  wipeDatabase,
} from "@/lib/seed"

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error("Set DATABASE_URL (see .env.example).")
  const db = connect(url, 1)
  try {
    if (process.argv.includes("--reset")) {
      await wipeDatabase(db)
      await seedDatabase(db, await readSeedFile())
      console.log("Database wiped and re-seeded.")
    } else {
      const seeded = await seedIfEmpty(db)
      console.log(
        seeded
          ? "Seeded demo data."
          : "Data already present, nothing seeded (use -- --reset to start over)."
      )
    }
  } finally {
    await db.$client.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

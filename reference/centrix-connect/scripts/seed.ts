/**
 * Seeds Supabase (or any Postgres in DATABASE_URL) from data/seed.json + data/partners/*.json.
 *   npx drizzle-kit migrate   # create tables
 *   npm run db:seed           # load demo data (use --reset to wipe first)
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { readSeedFile, seedDatabase, seedIfEmpty, wipeDatabase } from "../src/db/seed";
import type { DB } from "../src/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (Supabase transaction pooler URL).");
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema }) as unknown as DB;
  try {
    if (process.argv.includes("--reset")) {
      await wipeDatabase(db);
      await seedDatabase(db, await readSeedFile());
      console.log("Database wiped and re-seeded.");
    } else {
      await seedIfEmpty(db);
      console.log("Seed done (skipped if data already existed; use --reset to start over).");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

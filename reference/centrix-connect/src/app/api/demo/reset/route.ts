import { demoOnly, handle } from "@/lib/api";
import { readSeedFile, seedDatabase, wipeDatabase } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async (db) => {
    demoOnly();
    const data = await readSeedFile();
    await wipeDatabase(db);
    await seedDatabase(db, data);
    return { ok: true };
  });
}

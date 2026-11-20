import "server-only";
import path from "node:path";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

type Holder = { db?: Promise<DB> };
// Survive Next.js hot reloads without opening a new pool each time.
const holder = globalThis as unknown as { __centrixDb?: Holder };
holder.__centrixDb ??= {};

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function createDb(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    // prepare:false is required for Supabase's transaction pooler (pgBouncer).
    const client = postgres(url, { prepare: false, max: 5 });
    return drizzlePostgres(client, { schema });
  }

  // Local / demo fallback: embedded Postgres, migrated and seeded on first use.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(process.env.PGLITE_DIR || undefined);
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  const { seedIfEmpty } = await import("./seed");
  // Both drivers expose the same query builder; the cast keeps one DB type app-wide.
  await seedIfEmpty(db as unknown as DB);
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  holder.__centrixDb!.db ??= createDb().catch((err) => {
    holder.__centrixDb!.db = undefined; // allow retry on next request
    throw err;
  });
  return holder.__centrixDb!.db;
}

/** A transaction handle; same query API as DB. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything that can run queries: the DB itself or an open transaction. */
export type Exec = DB | Tx;

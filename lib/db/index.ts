import "server-only"

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "./schema"

/**
 * Pool size. The workflow engine holds row locks (SELECT … FOR UPDATE) inside
 * transactions while the demo pages poll, so one connection would serialise every
 * request. Default 5; set DATABASE_POOL_MAX=1 where a single connection is required
 * (e.g. a serverless function behind Supabase's transaction pooler).
 */
function poolMax() {
  const n = Number(process.env.DATABASE_POOL_MAX)
  return Number.isInteger(n) && n > 0 ? n : 5
}

export function connect(url: string, max = poolMax()) {
  const ca = process.env.SUPABASE_DB_CA_CERT
  const client = postgres(url, {
    prepare: false,
    max,
    idle_timeout: 20,
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  })

  return drizzle(client, { schema })
}

export type DB = ReturnType<typeof connect>
/** A transaction handle; same query API as DB. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0]
/** Anything that can run queries: the DB itself or an open transaction. */
export type Exec = DB | Tx

// Survive Next.js hot reloads without opening a new pool on every edit.
const holder = globalThis as unknown as { __coraDb?: DB }

export function getDb(): DB {
  if (holder.__coraDb) return holder.__coraDb

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL.")
  }

  holder.__coraDb = connect(url)
  return holder.__coraDb
}

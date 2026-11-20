import "server-only"

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "./schema"

function connect(url: string) {
  const ca = process.env.SUPABASE_DB_CA_CERT
  const client = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  })

  return drizzle(client, { schema })
}

let db: ReturnType<typeof connect> | undefined

export function getDb() {
  if (db) return db

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL.")
  }

  db = connect(url)
  return db
}

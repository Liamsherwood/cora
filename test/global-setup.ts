import path from "node:path"

import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

/**
 * Rebuilds the test database from the migrations once per `npm test` run.
 * Refuses to touch anything that isn't clearly a test database.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a Postgres database whose name ends in _test (see .env.example)."
    )
  }
  const dbName = decodeURIComponent(new URL(url).pathname.slice(1))
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against "${dbName}": the test database name must end in _test, because every run drops and re-creates its schema.`
    )
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.")
  }

  await ensureDatabase(url, dbName)

  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await client.unsafe(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
    )
    await migrate(drizzle(client), {
      migrationsFolder: path.resolve(import.meta.dirname, "../drizzle"),
    })
  } finally {
    await client.end()
  }
}

/** Creates the _test database on first use if the role is allowed to. */
async function ensureDatabase(url: string, dbName: string) {
  const probe = postgres(url, { max: 1 })
  try {
    await probe`select 1`
    return
  } catch (e) {
    if ((e as { code?: string }).code !== "3D000") throw e // 3D000 = database does not exist
  } finally {
    await probe.end()
  }
  const admin = new URL(url)
  admin.pathname = "/postgres"
  const sql = postgres(admin.toString(), { max: 1 })
  try {
    await sql.unsafe(`CREATE DATABASE "${dbName.replace(/"/g, "")}"`)
  } finally {
    await sql.end()
  }
}

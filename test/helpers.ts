import { expect } from "vitest"

import { connect, type DB } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { readSeedFile, seedDatabase, wipeDatabase } from "@/lib/seed"

// Pin the business clock to the reltix example: event on Fri 20 Nov 2026.
process.env.DEMO_NOW = "2026-11-20T09:14:00Z"

// Fixed ids from data/seed.json
export const UNIT_4B = "30000000-0000-4000-8000-00000000004b"
export const LENA = "40000000-0000-4000-8000-000000000202"
export const JONAS = "40000000-0000-4000-8000-000000000203"

let db: DB | undefined

/** One pool for the whole test file; 5 connections so concurrency tests really run in parallel. */
export function testDb(): DB {
  db ??= connect(process.env.TEST_DATABASE_URL!, 5)
  return db
}

export async function resetDb(): Promise<DB> {
  const d = testDb()
  await wipeDatabase(d)
  await seedDatabase(d, await readSeedFile())
  return d
}

export async function closeDb() {
  await db?.$client.end()
  db = undefined
}

export async function expectAppError(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.status === status
  )
}

import { and, eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { getUnitSnapshot, listUnits } from "@/lib/centrix/repository"
import type { DB } from "@/lib/db"
import * as t from "@/lib/db/schema"

import { closeDb, JONAS, resetDb, UNIT_4B } from "./helpers"

// Aachen fixtures from data/seed.json
const UNIT_2A = "30000000-0000-4000-8000-00000000002a"
const MARIA = "40000000-0000-4000-8000-000000000101"
const WEG = "40000000-0000-4000-8000-000000000100"
const LEASE_2A = "50000000-0000-4000-8000-00000000002a"

let db: DB

beforeEach(async () => {
  db = await resetDb()
})
afterAll(closeDb)

describe("unit snapshot", () => {
  it("reports the current owner, not a previous one", async () => {
    await db
      .update(t.ownerships)
      .set({ validTo: "2024-12-31" })
      .where(
        and(eq(t.ownerships.unitId, UNIT_2A), eq(t.ownerships.partyId, MARIA))
      )
    await db.insert(t.ownerships).values({
      unitId: UNIT_2A,
      partyId: WEG,
      validFrom: "2025-01-01",
    })
    const s = await getUnitSnapshot(db, UNIT_2A)
    expect(s.owner?.contact_id).toBe(WEG)
  })

  it("reports the current owner, not one whose ownership starts later", async () => {
    // Sale agreed: Maria owns 2A until year end, the WEG from 1 Jan 2027.
    await db
      .update(t.ownerships)
      .set({ validTo: "2026-12-31" })
      .where(
        and(eq(t.ownerships.unitId, UNIT_2A), eq(t.ownerships.partyId, MARIA))
      )
    await db.insert(t.ownerships).values({
      unitId: UNIT_2A,
      partyId: WEG,
      validFrom: "2027-01-01",
    })
    const s = await getUnitSnapshot(db, UNIT_2A)
    expect(s.owner?.contact_id).toBe(MARIA)
  })

  it("has no tenant once the last lease has ended, but keeps the lease history", async () => {
    expect((await getUnitSnapshot(db, UNIT_2A)).tenant?.contact_id).toBe(JONAS)
    await db
      .update(t.leases)
      .set({ endDate: "2026-10-31" })
      .where(eq(t.leases.id, LEASE_2A))
    const s = await getUnitSnapshot(db, UNIT_2A)
    expect(s.tenant).toBeNull()
    expect(s.contracts.map((c) => c.id)).toContain(LEASE_2A)
  })

  it("treats an upcoming lease's tenant as the resident (move-in)", async () => {
    const s = await getUnitSnapshot(db, UNIT_4B)
    expect(s.tenant?.move_in).toBe("2026-12-01")
  })
})

describe("listUnits", () => {
  it("lists every seeded unit with its property", async () => {
    const units = await listUnits(db)
    expect(units.length).toBeGreaterThan(300)
    expect(units.find((u) => u.id === UNIT_4B)?.property_id).toBe(
      "10000000-0000-4000-8000-000000000012"
    )
  })
})

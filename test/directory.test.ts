import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  DIRECTORY_PAGE_SIZE,
  findUnitsByTenant,
  getDirectoryCounts,
  getPerson,
  listAllRuns,
  listPartners,
  listPeople,
} from "@/lib/centrix/directory"
import type { DB } from "@/lib/db"
import { newId } from "@/lib/ids"
import { readSeedFile } from "@/lib/seed"
import { triggerEvent } from "@/lib/workflow/engine"

import { closeDb, LENA, resetDb, UNIT_4B } from "./helpers"

let db: DB
beforeAll(async () => {
  db = await resetDb()
})
afterAll(closeDb)

describe("directory", () => {
  it("counts every seeded record", async () => {
    const seed = await readSeedFile()
    expect(await getDirectoryCounts(db)).toMatchObject({
      properties: seed.properties.length,
      units: seed.units.length,
      people: seed.parties.length,
      workflows: 0,
    })
  })

  it("pages people by name with one look-ahead row", async () => {
    const first = await listPeople(db, { page: 1 })
    expect(first).toHaveLength(DIRECTORY_PAGE_SIZE + 1)
    const second = await listPeople(db, { page: 2 })
    // The look-ahead row is the first row of the next page.
    expect(second[0]!.id).toBe(first.at(-1)!.id)
    const names = first.map((p) => p.name)
    expect(names).toEqual(
      [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    )
  })

  it("finds a person by name and shows their roles and units", async () => {
    const [lena] = await listPeople(db, { q: "liam sher" })
    expect(lena).toMatchObject({ id: LENA, name: "Liam Sherwood" })
    expect(lena!.roles).toContain("tenant")
    expect(lena!.units.map((u) => u.id)).toContain(UNIT_4B)
  })

  it("treats search wildcards literally", async () => {
    expect(await listPeople(db, { q: "%" })).toEqual([])
    expect(await listPeople(db, { q: "_" })).toEqual([])
  })

  it("loads everything linked to a person", async () => {
    const person = await getPerson(db, LENA)
    expect(person?.party.name).toBe("Liam Sherwood")
    expect(person?.leases.some((l) => l.unitId === UNIT_4B)).toBe(true)
    expect(await getPerson(db, "not-a-uuid")).toBeNull()
    expect(await getPerson(db, newId())).toBeNull()
  })

  it("finds units by tenant name", async () => {
    expect(await findUnitsByTenant(db, "Sherwood")).toContain(UNIT_4B)
    expect(await findUnitsByTenant(db, " ")).toEqual([])
  })

  it("lists partners with their offers and usage", async () => {
    await triggerEvent(db, {
      id: newId(),
      type: "tenant.move_in",
      unit_id: UNIT_4B,
      party_id: LENA,
      payload: { move_in_date: "2026-12-01" },
    })
    const partners = await listPartners(db)
    expect(partners.map((p) => p.slug).sort()).toEqual([
      "example_fibre",
      "stadtwerk_energy",
    ])
    for (const p of partners) {
      expect(p.offers.length).toBeGreaterThan(0)
      expect(p.workflows).toBe(1)
      expect(p.orders).toBe(0)
    }

    const runs = await listAllRuns(db, { page: 1 })
    expect(runs).toHaveLength(2)
    expect(runs[0]).toMatchObject({
      unitId: UNIT_4B,
      partyId: LENA,
      eventType: "tenant.move_in",
      state: "detected",
    })
  })
})

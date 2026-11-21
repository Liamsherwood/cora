import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { demoRequests } from "@/components/dashboard/data"
import { getPortfolioOverview } from "@/lib/centrix/portfolio"
import type { DB } from "@/lib/db"
import { readSeedFile } from "@/lib/seed"

import { closeDb, resetDb } from "./helpers"

let db: DB
beforeAll(async () => {
  db = await resetDb()
})
afterAll(closeDb)

const TODAY = "2026-11-20"

describe("portfolio overview", () => {
  it("lists every seed property with its units", async () => {
    const seed = await readSeedFile()
    const { properties } = await getPortfolioOverview(db, TODAY)

    expect(properties).toHaveLength(seed.properties.length)
    expect(properties.reduce((sum, p) => sum + p.units, 0)).toBe(
      seed.units.length
    )
    expect(properties.every((p) => p.occupied <= p.units)).toBe(true)
    // Largest first.
    expect(properties[0]!.units).toBeGreaterThanOrEqual(
      properties.at(-1)!.units
    )
  })

  it("counts owner-occupied units as occupied and a future move-in as vacant", async () => {
    const { properties } = await getPortfolioOverview(db, TODAY)
    // Musterstraße 12: one let unit, one never let (owner lives there), 4B empty until 1 Dec.
    expect(properties.find((p) => p.name === "Musterstraße 12")).toMatchObject({
      address: "52062 Aachen",
      isWeg: true,
      units: 3,
      occupied: 2,
    })
  })

  it("sums the cold rent of the leases running on the 1st of each month", async () => {
    const seed = await readSeedFile()
    const { rentRoll } = await getPortfolioOverview(db, TODAY)
    const nov = rentRoll.at(-1)!
    expect(new Date(nov.month).toISOString()).toBe("2026-11-01T00:00:00.000Z")
    const expected = seed.leases
      .filter(
        (l) =>
          l.start_date <= "2026-11-01" &&
          (!l.end_date || l.end_date >= "2026-11-01")
      )
      .reduce((sum, l) => sum + Number(l.rent_cold_eur), 0)
    expect(nov.expected).toBe(Math.round(expected))
    expect(nov.collected).toBeLessThanOrEqual(nov.expected)
  })

  it("files the demo requests against seed properties", async () => {
    const { properties } = await getPortfolioOverview(db, TODAY)
    const ids = new Set(properties.map((p) => p.id))
    for (const r of demoRequests) expect(ids).toContain(r.propertyId)
  })
})

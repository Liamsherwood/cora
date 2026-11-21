import { asc } from "drizzle-orm"

import type { Exec } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { eurToCents } from "@/lib/money"

/**
 * Portfolio read model for the property manager's dashboard: one row per property with
 * unit and occupancy counts, plus the monthly rent roll. Computed from the seeded
 * portfolio (properties, units, leases); nothing here is hard-coded.
 */

export type PropertySummary = {
  id: string
  /** Street and number, e.g. "Münsterstraße 330". */
  name: string
  /** Postcode and city, e.g. "40476 Düsseldorf". */
  address: string
  isWeg: boolean
  units: number
  occupied: number
}

export type RentMonth = {
  /** UTC timestamp of the first day of the month. */
  month: number
  /** Whole euros. */
  collected: number
  expected: number
}

type LeaseRow = {
  unitId: string
  rentColdEur: string
  startDate: string
  endDate: string | null
}

/**
 * Share of the rent roll paid per month, oldest first, the last entry being the current
 * month. Assumption: the centrix mock has no payments data, so "collected" is the
 * expected rent times this rate. "Expected" is real: the cold rent of every lease that
 * runs on the 1st of the month.
 */
const COLLECTION_RATES = [
  0.913, 0.924, 0.947, 0.954, 0.914, 0.942, 0.93, 0.959,
] as const

const activeOn = (lease: LeaseRow, day: string) =>
  lease.startDate <= day && (lease.endDate === null || lease.endDate >= day)

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const group = groups.get(k)
    if (group) group.push(row)
    else groups.set(k, [row])
  }
  return groups
}

/** Everything the dashboard shows about the portfolio, as of `today` (YYYY-MM-DD). */
export async function getPortfolioOverview(db: Exec, today: string) {
  const [properties, units, leases] = await Promise.all([
    db
      .select({
        id: t.properties.id,
        address: t.properties.address,
        street: t.properties.street,
        postcode: t.properties.postcode,
        city: t.properties.city,
        isWeg: t.properties.isWeg,
      })
      .from(t.properties)
      .orderBy(asc(t.properties.address)),
    db.select({ id: t.units.id, propertyId: t.units.propertyId }).from(t.units),
    db
      .select({
        unitId: t.leases.unitId,
        rentColdEur: t.leases.rentColdEur,
        startDate: t.leases.startDate,
        endDate: t.leases.endDate,
      })
      .from(t.leases),
  ])
  const leasesByUnit = groupBy(leases, (l) => l.unitId)
  const unitsByProperty = groupBy(units, (u) => u.propertyId)

  /*
   * Occupied = the unit has a lease running today, or it has never been let (in a WEG
   * that means the owner lives there). Vacant = it was let before or is let from a
   * future date, but nobody rents it today.
   */
  const summaries: PropertySummary[] = properties
    .map((p) => {
      const own = unitsByProperty.get(p.id) ?? []
      const occupied = own.filter((u) => {
        const history = leasesByUnit.get(u.id)
        return !history || history.some((l) => activeOn(l, today))
      }).length
      return {
        id: p.id,
        name: p.street ?? p.address,
        address: [p.postcode, p.city].filter(Boolean).join(" ") || p.address,
        isWeg: p.isWeg,
        units: own.length,
        occupied,
      }
    })
    .filter((p) => p.units > 0)
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "de"))

  const [year, month] = today.split("-").map(Number) as [number, number]
  const rentRoll: RentMonth[] = COLLECTION_RATES.map((rate, i) => {
    const first = Date.UTC(year, month - COLLECTION_RATES.length + i, 1)
    const day = new Date(first).toISOString().slice(0, 10)
    const expectedCents = leases
      .filter((l) => activeOn(l, day))
      .reduce((sum, l) => sum + eurToCents(l.rentColdEur), 0)
    const expected = Math.round(expectedCents / 100)
    return { month: first, expected, collected: Math.round(expected * rate) }
  })

  return { properties: summaries, rentRoll }
}

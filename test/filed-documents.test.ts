import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  documentRef,
  listFiledDocuments,
  listUnitDocuments,
} from "@/lib/centrix/documents"
import type { DB } from "@/lib/db"
import { readSeedFile } from "@/lib/seed"

import { closeDb, resetDb, UNIT_4B } from "./helpers"

let db: DB
beforeAll(async () => {
  db = await resetDb()
})
afterAll(closeDb)

describe("documents on file", () => {
  it("lists every document once, with its own reference", async () => {
    const filed = await listFiledDocuments(db)
    const keys = filed.map((d) => `${d.kind}:${d.id}:${d.party ?? ""}`)
    expect(new Set(keys).size).toBe(filed.length)
    const refs = filed.map((d) => documentRef(d.kind, d.id, d.party))
    expect(new Set(refs).size).toBe(filed.length)
  })

  it("keeps past tenancies and one guarantee per guarantor", async () => {
    const seed = await readSeedFile()
    const filed = await listFiledDocuments(db)
    const leases = new Set(
      filed.filter((d) => d.kind === "lease").map((d) => d.id)
    )
    const ended = seed.leases.filter(
      (l) => l.end_date && l.end_date < "2026-11-20"
    )
    expect(ended.length).toBeGreaterThan(0)
    for (const l of ended) expect(leases).toContain(l.id)

    const guarantors = seed.lease_parties.filter((p) => p.role === "guarantor")
    expect(filed.filter((d) => d.kind === "guarantee")).toHaveLength(
      guarantors.length
    )
  })

  it("includes everything the unit panel lists", async () => {
    const filed = new Set(
      (await listFiledDocuments(db)).map((d) => `${d.kind}:${d.id}`)
    )
    for (const link of await listUnitDocuments(db, UNIT_4B))
      expect(filed).toContain(`${link.kind}:${link.id}`)
  })

  it("numbers the buildings of a property with several", async () => {
    const energy = (await listFiledDocuments(db)).filter(
      (d) => d.kind === "energy" && d.building
    )
    for (const d of energy) {
      expect(d.building!.number).toBeGreaterThanOrEqual(1)
      expect(d.building!.number).toBeLessThanOrEqual(d.building!.of)
    }
  })
})

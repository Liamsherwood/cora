import fs from "node:fs/promises"
import path from "node:path"

import { is, sql } from "drizzle-orm"
import { z } from "zod"

import type { DB } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { getTableConfig, PgTable } from "drizzle-orm/pg-core"
import { loadManifestFiles, registerPartner } from "@/lib/connectors/registry"

/*
 * data/seed.json uses the snake_case column names, one array per table, with fixed
 * UUIDs. It is validated before anything is written, so a typo in the data file gives a
 * readable error instead of a half-seeded database.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const id = z.uuid()
const eur = z.string().regex(/^\d+(\.\d{1,2})?$/, "expected EUR like 780.00")

const SeedSchema = z.object({
  properties: z.array(
    z.object({
      id,
      address: z.string().min(1),
      street: z.string(),
      postcode: z.string().regex(/^\d{5}$/),
      city: z.string(),
      is_weg: z.boolean(),
    })
  ),
  buildings: z.array(
    z.object({
      id,
      property_id: id,
      building_year: z.number().int().nullish(),
      heating_type: z.string().nullish(),
      energy_class: z.string().nullish(),
    })
  ),
  units: z.array(
    z.object({
      id,
      building_id: id,
      property_id: id,
      identifier: z.string(),
      floor: z.number().int().nullish(),
      size_sqm: z.number().int().positive().nullish(),
      rooms: z.number().int().nullish(),
    })
  ),
  parties: z.array(
    z.object({
      id,
      type: z.enum(["person", "organization"]),
      name: z.string(),
      email: z.email().nullish(),
      phone: z.string().nullish(),
      whatsapp_opt_in: z.boolean().default(false),
      language: z.string().default("de"),
    })
  ),
  ownerships: z.array(
    z.object({
      party_id: id,
      unit_id: id,
      mea_share: z.string().nullish(),
      valid_from: day,
      valid_to: day.nullish(),
    })
  ),
  leases: z.array(
    z.object({
      id,
      unit_id: id,
      rent_cold_eur: eur,
      start_date: day,
      end_date: day.nullish(),
    })
  ),
  lease_parties: z.array(
    z.object({
      lease_id: id,
      party_id: id,
      role: z.enum(["tenant", "co_tenant", "guarantor"]),
    })
  ),
  mandates: z.array(
    z.object({
      id,
      property_id: id,
      party_id: id,
      type: z.enum(["weg", "rental"]),
      approval_limit_eur: eur.nullish(),
    })
  ),
  assets: z
    .array(
      z.object({
        id,
        building_id: id,
        property_id: id,
        unit_id: id.nullish(),
        asset_type: z.string(),
        ownership_scope: z.enum(["common", "special"]),
      })
    )
    .default([]),
  meters: z
    .array(
      z.object({
        id,
        unit_id: id,
        type: z.enum(["electricity", "gas", "water", "heat"]),
        number: z.string(),
      })
    )
    .default([]),
})

export type SeedData = z.infer<typeof SeedSchema>

export async function readSeedFile(): Promise<SeedData> {
  // Literal path so the bundler only traces data/seed.json.
  const raw = JSON.parse(
    await fs.readFile(path.join(process.cwd(), "data", "seed.json"), "utf8")
  )
  const parsed = SeedSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    throw new Error(`data/seed.json is invalid:\n${msg}`)
  }
  return parsed.data
}

const n = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v)

export async function seedDatabase(db: DB, data: SeedData): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(t.properties).values(
      data.properties.map((p) => ({
        id: p.id,
        address: p.address,
        street: p.street,
        postcode: p.postcode,
        city: p.city,
        isWeg: p.is_weg,
      }))
    )
    await tx.insert(t.buildings).values(
      data.buildings.map((b) => ({
        id: b.id,
        propertyId: b.property_id,
        buildingYear: n(b.building_year),
        heatingType: n(b.heating_type),
        energyClass: n(b.energy_class),
      }))
    )
    await tx.insert(t.units).values(
      data.units.map((u) => ({
        id: u.id,
        buildingId: u.building_id,
        propertyId: u.property_id,
        identifier: u.identifier,
        floor: n(u.floor),
        sizeSqm: n(u.size_sqm),
        rooms: n(u.rooms),
      }))
    )
    await tx.insert(t.parties).values(
      data.parties.map((p) => ({
        id: p.id,
        type: p.type,
        name: p.name,
        email: n(p.email),
        phone: n(p.phone),
        whatsappOptIn: p.whatsapp_opt_in,
        language: p.language,
      }))
    )
    if (data.ownerships.length)
      await tx.insert(t.ownerships).values(
        data.ownerships.map((o) => ({
          partyId: o.party_id,
          unitId: o.unit_id,
          meaShare: n(o.mea_share),
          validFrom: o.valid_from,
          validTo: n(o.valid_to),
        }))
      )
    if (data.leases.length)
      await tx.insert(t.leases).values(
        data.leases.map((l) => ({
          id: l.id,
          unitId: l.unit_id,
          rentColdEur: l.rent_cold_eur,
          startDate: l.start_date,
          endDate: n(l.end_date),
        }))
      )
    if (data.lease_parties.length)
      await tx.insert(t.leaseParties).values(
        data.lease_parties.map((l) => ({
          leaseId: l.lease_id,
          partyId: l.party_id,
          role: l.role,
        }))
      )
    if (data.mandates.length)
      await tx.insert(t.mandates).values(
        data.mandates.map((m) => ({
          id: m.id,
          propertyId: m.property_id,
          partyId: m.party_id,
          type: m.type,
          approvalLimitEur: n(m.approval_limit_eur),
        }))
      )
    if (data.assets.length)
      await tx.insert(t.assets).values(
        data.assets.map((a) => ({
          id: a.id,
          buildingId: a.building_id,
          propertyId: a.property_id,
          unitId: n(a.unit_id),
          assetType: a.asset_type,
          ownershipScope: a.ownership_scope,
        }))
      )
    if (data.meters.length)
      await tx.insert(t.meters).values(
        data.meters.map((m) => ({
          id: m.id,
          unitId: m.unit_id,
          type: m.type,
          number: m.number,
        }))
      )
  })

  for (const m of await loadManifestFiles()) {
    if (m.ok) await registerPartner(db, m.manifest)
    else
      console.warn(
        `[seed] skipped partner manifest ${m.file}:\n  ${m.errors.join("\n  ")}`
      )
  }
}

export async function seedIfEmpty(db: DB): Promise<boolean> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(t.properties)
  if ((row?.c ?? 0) > 0) return false
  await seedDatabase(db, await readSeedFile())
  return true
}

/** Every application table, taken from the schema so a new table can't be forgotten. */
function appTables(): string[] {
  return (Object.values(t) as unknown[])
    .filter((v): v is PgTable => is(v, PgTable))
    .map((v) => getTableConfig(v).name)
}

/** Deletes all rows. Only for the demo reset endpoint, the seed script and tests. */
export async function wipeDatabase(db: DB): Promise<void> {
  const names = appTables().map((x) => `"${x}"`)
  await db.execute(sql.raw(`TRUNCATE ${names.join(", ")} CASCADE`))
}

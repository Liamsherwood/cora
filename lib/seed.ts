import fs from "node:fs/promises"
import path from "node:path"

import { getTableColumns, inArray, or, sql } from "drizzle-orm"
import { z } from "zod"

import type { DB, Tx } from "@/lib/db"
import * as t from "@/lib/db/schema"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
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
  // History: repair and move cases, contractor jobs, case files and past events.
  cases: z
    .array(
      z.object({
        id,
        property_id: id,
        unit_id: id.nullish(),
        reporter_party_id: id.nullish(),
        asset_id: id.nullish(),
        category: z.enum([
          "heating",
          "plumbing",
          "electrical",
          "internet",
          "damp_mould",
          "pests",
          "appliance",
          "elevator",
          "access_keys",
          "noise",
          "move_in",
          "move_out",
          "other",
        ]),
        priority: z.enum(["low", "normal", "high", "emergency"]),
        status: z.enum([
          "open",
          "triaged",
          "scheduled",
          "in_progress",
          "resolved",
          "closed",
          "cancelled",
        ]),
      })
    )
    .default([]),
  work_orders: z
    .array(
      z.object({
        id,
        case_id: id,
        contractor_id: id,
        scheduled_at: z.iso.datetime({ offset: true }).nullish(),
        cost_estimate_eur: eur.nullish(),
        payer: z.enum(["owner", "tenant", "weg", "insurance"]).nullish(),
        status: z.enum([
          "requested",
          "accepted",
          "scheduled",
          "in_progress",
          "completed",
          "invoiced",
          "cancelled",
        ]),
      })
    )
    .default([]),
  documents: z
    .array(
      z.object({
        id,
        case_id: id,
        type: z.enum([
          "photo",
          "quote",
          "invoice",
          "lease",
          "handover_protocol",
          "registration_confirmation",
          "meter_photo",
          "consent_record",
        ]),
        url: z.string().min(1),
      })
    )
    .default([]),
  events: z
    .array(
      z.object({
        id,
        // Dotted names like the connector triggers: tenant.move_in, case.created, ...
        type: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/, "expected e.g. tenant.move_in"),
        unit_id: id,
        party_id: id.nullish(),
        occurred_at: z.iso.datetime({ offset: true }),
        payload: z.record(z.string(), z.unknown()).default({}),
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

/**
 * Insert-or-update by primary key: re-running the seed restores the seed rows to their
 * seed values and never touches rows that are not part of the seed.
 */
async function upsert(
  tx: Tx,
  table: PgTable,
  target: PgColumn[],
  rows: Record<string, unknown>[]
) {
  if (rows.length === 0) return
  const cols = getTableColumns(table) as Record<string, PgColumn>
  const keys = new Set(target.map((c) => c.name))
  const set = Object.fromEntries(
    Object.keys(rows[0]!)
      .filter((k) => !keys.has(cols[k]!.name))
      .map((k) => [k, sql.raw(`excluded."${cols[k]!.name}"`)])
  )
  const insert = tx.insert(table).values(rows as never)
  await (Object.keys(set).length
    ? insert.onConflictDoUpdate({ target, set })
    : insert.onConflictDoNothing({ target }))
}

/** Writes the seed rows (idempotent) and registers the partner manifests in data/partners. */
export async function seedDatabase(db: DB, data: SeedData): Promise<void> {
  await db.transaction((tx) => upsertSeedRows(tx, data))
  await registerManifests(db)
}

async function registerManifests(db: DB) {
  for (const m of await loadManifestFiles()) {
    if (m.ok) await registerPartner(db, m.manifest)
    else
      console.warn(
        `[seed] skipped partner manifest ${m.file}:\n  ${m.errors.join("\n  ")}`
      )
  }
}

async function upsertSeedRows(tx: Tx, data: SeedData) {
  await upsert(
    tx,
    t.properties,
    [t.properties.id],
    data.properties.map((p) => ({
      id: p.id,
      address: p.address,
      street: p.street,
      postcode: p.postcode,
      city: p.city,
      isWeg: p.is_weg,
    }))
  )
  await upsert(
    tx,
    t.buildings,
    [t.buildings.id],
    data.buildings.map((b) => ({
      id: b.id,
      propertyId: b.property_id,
      buildingYear: n(b.building_year),
      heatingType: n(b.heating_type),
      energyClass: n(b.energy_class),
    }))
  )
  await upsert(
    tx,
    t.units,
    [t.units.id],
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
  await upsert(
    tx,
    t.parties,
    [t.parties.id],
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
  await upsert(
    tx,
    t.ownerships,
    [t.ownerships.unitId, t.ownerships.partyId, t.ownerships.validFrom],
    data.ownerships.map((o) => ({
      partyId: o.party_id,
      unitId: o.unit_id,
      meaShare: n(o.mea_share),
      validFrom: o.valid_from,
      validTo: n(o.valid_to),
    }))
  )
  await upsert(
    tx,
    t.leases,
    [t.leases.id],
    data.leases.map((l) => ({
      id: l.id,
      unitId: l.unit_id,
      rentColdEur: l.rent_cold_eur,
      startDate: l.start_date,
      endDate: n(l.end_date),
    }))
  )
  await upsert(
    tx,
    t.leaseParties,
    [t.leaseParties.leaseId, t.leaseParties.partyId, t.leaseParties.role],
    data.lease_parties.map((l) => ({
      leaseId: l.lease_id,
      partyId: l.party_id,
      role: l.role,
    }))
  )
  await upsert(
    tx,
    t.mandates,
    [t.mandates.id],
    data.mandates.map((m) => ({
      id: m.id,
      propertyId: m.property_id,
      partyId: m.party_id,
      type: m.type,
      approvalLimitEur: n(m.approval_limit_eur),
    }))
  )
  await upsert(
    tx,
    t.assets,
    [t.assets.id],
    data.assets.map((a) => ({
      id: a.id,
      buildingId: a.building_id,
      propertyId: a.property_id,
      unitId: n(a.unit_id),
      assetType: a.asset_type,
      ownershipScope: a.ownership_scope,
    }))
  )
  await upsert(
    tx,
    t.meters,
    [t.meters.id],
    data.meters.map((m) => ({
      id: m.id,
      unitId: m.unit_id,
      type: m.type,
      number: m.number,
    }))
  )
  // History. On a demo reset the events on seed units are cleared first, so this also
  // restores the seeded history.
  await upsert(
    tx,
    t.cases,
    [t.cases.id],
    data.cases.map((c) => ({
      id: c.id,
      propertyId: c.property_id,
      unitId: n(c.unit_id),
      reporterPartyId: n(c.reporter_party_id),
      assetId: n(c.asset_id),
      category: c.category,
      priority: c.priority,
      status: c.status,
    }))
  )
  await upsert(
    tx,
    t.workOrders,
    [t.workOrders.id],
    data.work_orders.map((w) => ({
      id: w.id,
      caseId: w.case_id,
      contractorId: w.contractor_id,
      scheduledAt: w.scheduled_at ? new Date(w.scheduled_at) : null,
      costEstimateEur: n(w.cost_estimate_eur),
      payer: n(w.payer),
      status: w.status,
    }))
  )
  await upsert(
    tx,
    t.documents,
    [t.documents.id],
    data.documents.map((d) => ({
      id: d.id,
      caseId: d.case_id,
      type: d.type,
      url: d.url,
    }))
  )
  await upsert(
    tx,
    t.events,
    [t.events.id],
    data.events.map((e) => ({
      id: e.id,
      type: e.type,
      unitId: e.unit_id,
      partyId: n(e.party_id),
      occurredAt: new Date(e.occurred_at),
      payload: e.payload,
    }))
  )
}

/**
 * Removes what the demo created on the seed units (events, workflow runs and everything
 * hanging off them: conversations, messages, audit trail, consents, service orders).
 * Scoped by the seed's unit ids: rows of any other unit are never touched.
 */
async function clearDemoActivity(tx: Tx, data: SeedData) {
  const unitIds = data.units.map((u) => u.id)
  if (unitIds.length === 0) return
  const events = tx
    .select({ id: t.events.id })
    .from(t.events)
    .where(inArray(t.events.unitId, unitIds))
  const runs = tx
    .select({ id: t.workflowRuns.id })
    .from(t.workflowRuns)
    .where(inArray(t.workflowRuns.eventId, events))
  const conversations = tx
    .select({ id: t.conversations.id })
    .from(t.conversations)
    .where(inArray(t.conversations.workflowRunId, runs))

  await tx
    .delete(t.messages)
    .where(inArray(t.messages.conversationId, conversations))
  await tx
    .delete(t.conversations)
    .where(inArray(t.conversations.workflowRunId, runs))
  await tx
    .delete(t.auditEvents)
    .where(inArray(t.auditEvents.workflowRunId, runs))
  await tx
    .delete(t.serviceOrders)
    .where(
      or(
        inArray(t.serviceOrders.workflowRunId, runs),
        inArray(t.serviceOrders.unitId, unitIds)
      )
    )
  await tx.delete(t.consents).where(inArray(t.consents.workflowRunId, runs))
  await tx.delete(t.workflowRuns).where(inArray(t.workflowRuns.id, runs))
  await tx.delete(t.events).where(inArray(t.events.unitId, unitIds))
}

/**
 * Demo reset: clears the demo's activity on the seed units and restores the seed rows.
 * Tables, other units and their data stay as they are.
 */
export async function resetDemoData(db: DB, data?: SeedData): Promise<void> {
  const seed = data ?? (await readSeedFile())
  await db.transaction(async (tx) => {
    await clearDemoActivity(tx, seed)
    await upsertSeedRows(tx, seed)
  })
  await registerManifests(db)
}

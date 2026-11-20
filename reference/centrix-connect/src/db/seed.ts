import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "./client";
import * as t from "./schema";
import { loadManifestFiles, registerPartner } from "@/connectors/registry";

/*
 * data/seed.json uses the snake_case field names from the ER model, one array per table.
 * It is validated before anything is written, so a typo in the data file produces a
 * readable error instead of a half-seeded database.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1);

const SeedSchema = z.object({
  properties: z.array(z.object({ id, name: z.string().nullish(), street: z.string(), postcode: z.string().regex(/^\d{5}$/), city: z.string(), is_weg: z.boolean() })),
  buildings: z.array(z.object({ id, property_id: id, building_year: z.number().int().nullish(), heating_type: z.string().nullish(), energy_class: z.string().nullish(), energy_certificate_valid_until: day.nullish() })),
  units: z.array(z.object({ id, building_id: id, identifier: z.string(), floor: z.number().int().nullish(), size_sqm: z.number().int().nullish(), rooms: z.number().int().nullish() })),
  parties: z.array(z.object({ id, type: z.enum(["person", "organization"]), name: z.string(), email: z.string().email().nullish(), phone: z.string().nullish(), whatsapp_opt_in: z.boolean().default(false), language: z.string().default("de") })),
  ownerships: z.array(z.object({ party_id: id, unit_id: id, mea_share: z.union([z.string(), z.number()]).nullish(), valid_from: day.nullish(), valid_to: day.nullish() })),
  leases: z.array(z.object({ id, unit_id: id, rent_cold_cents: z.number().int().nullish(), start_date: day, end_date: day.nullish() })),
  lease_parties: z.array(z.object({ lease_id: id, party_id: id, role: z.enum(["tenant", "co_tenant", "guarantor"]) })),
  mandates: z.array(z.object({ id, property_id: id, grantor_party_id: id.nullish(), type: z.enum(["weg", "rental"]), approval_limit_cents: z.number().int().nullish() })),
  assets: z.array(z.object({ id, building_id: id, unit_id: id.nullish(), asset_type: z.string(), ownership_scope: z.enum(["common", "special"]) })).default([]),
  meters: z.array(z.object({ id, unit_id: id, type: z.enum(["electricity", "gas", "water", "heat"]), number: z.string() })).default([]),
  cases: z.array(z.object({ id, property_id: id, unit_id: id.nullish(), reporter_party_id: id.nullish(), asset_id: id.nullish(), category: z.string(), priority: z.string().default("normal"), status: z.string().default("open") })).default([]),
  work_orders: z.array(z.object({ id, case_id: id, contractor_id: id.nullish(), scheduled_at: z.string().nullish(), cost_estimate_cents: z.number().int().nullish(), payer: z.string().nullish(), status: z.string().default("open") })).default([]),
  documents: z.array(z.object({ id, case_id: id.nullish(), unit_id: id.nullish(), type: z.string(), url: z.string() })).default([]),
});

export type SeedData = z.infer<typeof SeedSchema>;

export async function readSeedFile(file = path.join(process.cwd(), "data", "seed.json")): Promise<SeedData> {
  const raw = JSON.parse(await fs.readFile(file, "utf8"));
  const parsed = SeedSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`data/seed.json is invalid:\n${msg}`);
  }
  return parsed.data;
}

const n = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v);

export async function seedDatabase(db: DB, data: SeedData): Promise<void> {
  await db.transaction(async (tx) => {
    if (data.properties.length) await tx.insert(t.properties).values(data.properties.map((p) => ({ id: p.id, name: n(p.name), street: p.street, postcode: p.postcode, city: p.city, isWeg: p.is_weg })));
    if (data.buildings.length) await tx.insert(t.buildings).values(data.buildings.map((b) => ({ id: b.id, propertyId: b.property_id, buildingYear: n(b.building_year), heatingType: n(b.heating_type), energyClass: n(b.energy_class), energyCertificateValidUntil: n(b.energy_certificate_valid_until) })));
    if (data.units.length) await tx.insert(t.units).values(data.units.map((u) => ({ id: u.id, buildingId: u.building_id, identifier: u.identifier, floor: n(u.floor), sizeSqm: n(u.size_sqm), rooms: n(u.rooms) })));
    if (data.parties.length) await tx.insert(t.parties).values(data.parties.map((p) => ({ id: p.id, type: p.type, name: p.name, email: n(p.email), phone: n(p.phone), whatsappOptIn: p.whatsapp_opt_in, language: p.language })));
    if (data.ownerships.length) await tx.insert(t.ownerships).values(data.ownerships.map((o) => ({ partyId: o.party_id, unitId: o.unit_id, meaShare: o.mea_share == null ? null : String(o.mea_share), validFrom: n(o.valid_from), validTo: n(o.valid_to) })));
    if (data.leases.length) await tx.insert(t.leases).values(data.leases.map((l) => ({ id: l.id, unitId: l.unit_id, rentColdCents: n(l.rent_cold_cents), startDate: l.start_date, endDate: n(l.end_date) })));
    if (data.lease_parties.length) await tx.insert(t.leaseParties).values(data.lease_parties.map((l) => ({ leaseId: l.lease_id, partyId: l.party_id, role: l.role })));
    if (data.mandates.length) await tx.insert(t.mandates).values(data.mandates.map((m) => ({ id: m.id, propertyId: m.property_id, grantorPartyId: n(m.grantor_party_id), type: m.type, approvalLimitCents: n(m.approval_limit_cents) })));
    if (data.assets.length) await tx.insert(t.assets).values(data.assets.map((a) => ({ id: a.id, buildingId: a.building_id, unitId: n(a.unit_id), assetType: a.asset_type, ownershipScope: a.ownership_scope })));
    if (data.meters.length) await tx.insert(t.meters).values(data.meters.map((m) => ({ id: m.id, unitId: m.unit_id, type: m.type, number: m.number })));
    if (data.cases.length) await tx.insert(t.cases).values(data.cases.map((c) => ({ id: c.id, propertyId: c.property_id, unitId: n(c.unit_id), reporterPartyId: n(c.reporter_party_id), assetId: n(c.asset_id), category: c.category, priority: c.priority, status: c.status })));
    if (data.work_orders.length) await tx.insert(t.workOrders).values(data.work_orders.map((w) => ({ id: w.id, caseId: w.case_id, contractorId: n(w.contractor_id), scheduledAt: n(w.scheduled_at), costEstimateCents: n(w.cost_estimate_cents), payer: n(w.payer), status: w.status })));
    if (data.documents.length) await tx.insert(t.documents).values(data.documents.map((d) => ({ id: d.id, caseId: n(d.case_id), unitId: n(d.unit_id), type: d.type, url: d.url })));
  });

  const manifests = await loadManifestFiles();
  for (const m of manifests) {
    if (m.ok) await registerPartner(db, m.manifest);
    else console.warn(`[seed] skipped partner manifest ${m.file}:\n  ${m.errors.join("\n  ")}`);
  }
}

export async function seedIfEmpty(db: DB): Promise<void> {
  const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(t.properties);
  if ((row?.c ?? 0) > 0) return;
  await seedDatabase(db, await readSeedFile());
}

/** Deletes all rows (children first). Only used by the demo reset endpoint and tests. */
export async function wipeDatabase(db: DB): Promise<void> {
  const order = [
    "ai_audit_event", "ai_message", "ai_conversation", "centrix_service_contract", "partner_service_order",
    "partner_consent", "ai_workflow_run", "centrix_event", "partner_offer", "partner_partner",
    "centrix_document", "centrix_work_order", "centrix_case", "centrix_meter", "centrix_asset",
    "centrix_mandate", "centrix_lease_party", "centrix_lease", "centrix_ownership", "centrix_party",
    "centrix_unit", "centrix_building", "centrix_property",
  ];
  await db.execute(sql.raw(`TRUNCATE ${order.map((x) => `"${x}"`).join(", ")} CASCADE`));
}

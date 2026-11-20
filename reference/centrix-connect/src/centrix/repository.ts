import { and, desc, eq } from "drizzle-orm";
import type { Exec } from "@/db/client";
import * as t from "@/db/schema";

/**
 * Mock of the centrix API. Everything outside src/centrix talks to centrix through
 * these functions (or the /api/centrix routes that wrap them), never through the
 * centrix_* tables directly – so the mock can be swapped for the real API later.
 */

export type UnitSnapshot = {
  unit_id: string;
  property: {
    id: string;
    address: string;
    street: string;
    postcode: string;
    city: string;
    is_weg: boolean;
    building_year: number | null;
    heating: string | null;
    energy_certificate: { class: string | null; valid_until: string | null };
  };
  unit: { identifier: string; floor: number | null; size_sqm: number | null; rooms: number | null; meters: { type: string; number: string }[] };
  owner: { contact_id: string; name: string } | null;
  tenant: { contact_id: string; name: string; email: string | null; phone: string | null; language: string; whatsapp_opt_in: boolean; move_in: string } | null;
  contracts: { type: "lease"; id: string; rent_cold_eur: number | null; start: string; end: string | null }[];
  service_contracts: (typeof t.serviceContracts.$inferSelect)[];
};

export class NotFoundError extends Error {}

export async function getUnitSnapshot(db: Exec, unitId: string): Promise<UnitSnapshot> {
  const [row] = await db
    .select({ unit: t.units, building: t.buildings, property: t.properties })
    .from(t.units)
    .innerJoin(t.buildings, eq(t.units.buildingId, t.buildings.id))
    .innerJoin(t.properties, eq(t.buildings.propertyId, t.properties.id))
    .where(eq(t.units.id, unitId));
  if (!row) throw new NotFoundError(`unit ${unitId} not found`);

  const [meters, owners, leaseRows, contracts] = await Promise.all([
    db.select().from(t.meters).where(eq(t.meters.unitId, unitId)),
    db
      .select({ party: t.parties })
      .from(t.ownerships)
      .innerJoin(t.parties, eq(t.ownerships.partyId, t.parties.id))
      .where(eq(t.ownerships.unitId, unitId)),
    db
      .select({ lease: t.leases, party: t.parties, role: t.leaseParties.role })
      .from(t.leases)
      .innerJoin(t.leaseParties, eq(t.leaseParties.leaseId, t.leases.id))
      .innerJoin(t.parties, eq(t.leaseParties.partyId, t.parties.id))
      .where(eq(t.leases.unitId, unitId))
      .orderBy(desc(t.leases.startDate)),
    db.select().from(t.serviceContracts).where(eq(t.serviceContracts.unitId, unitId)).orderBy(desc(t.serviceContracts.updatedAt)),
  ]);

  // Most recent lease's primary tenant = the resident we talk to.
  const tenantRow = leaseRows.find((l) => l.role === "tenant");
  const owner = owners[0]?.party ?? null;
  const leases = [...new Map(leaseRows.map((l) => [l.lease.id, l.lease])).values()];
  const p = row.property;

  return {
    unit_id: row.unit.id,
    property: {
      id: p.id,
      address: `${p.street}, ${p.postcode} ${p.city}`,
      street: p.street,
      postcode: p.postcode,
      city: p.city,
      is_weg: p.isWeg,
      building_year: row.building.buildingYear,
      heating: row.building.heatingType,
      energy_certificate: { class: row.building.energyClass, valid_until: row.building.energyCertificateValidUntil },
    },
    unit: {
      identifier: row.unit.identifier,
      floor: row.unit.floor,
      size_sqm: row.unit.sizeSqm,
      rooms: row.unit.rooms,
      meters: meters.map((m) => ({ type: m.type, number: m.number })),
    },
    owner: owner ? { contact_id: owner.id, name: owner.name } : null,
    tenant: tenantRow
      ? {
          contact_id: tenantRow.party.id,
          name: tenantRow.party.name,
          email: tenantRow.party.email,
          phone: tenantRow.party.phone,
          language: tenantRow.party.language,
          whatsapp_opt_in: tenantRow.party.whatsappOptIn,
          move_in: tenantRow.lease.startDate,
        }
      : null,
    contracts: leases.map((l) => ({
      type: "lease" as const,
      id: l.id,
      rent_cold_eur: l.rentColdCents == null ? null : l.rentColdCents / 100,
      start: l.startDate,
      end: l.endDate,
    })),
    service_contracts: contracts,
  };
}

export async function listUnits(db: Exec) {
  return db
    .select({ id: t.units.id, identifier: t.units.identifier, street: t.properties.street, city: t.properties.city })
    .from(t.units)
    .innerJoin(t.buildings, eq(t.units.buildingId, t.buildings.id))
    .innerJoin(t.properties, eq(t.buildings.propertyId, t.properties.id))
    .orderBy(t.units.id);
}

export async function getParty(db: Exec, partyId: string) {
  const [p] = await db.select().from(t.parties).where(eq(t.parties.id, partyId));
  return p ?? null;
}

export async function insertEvent(db: Exec, e: typeof t.events.$inferInsert) {
  await db.insert(t.events).values(e);
}

export async function upsertServiceContract(db: Exec, c: typeof t.serviceContracts.$inferInsert) {
  await db
    .insert(t.serviceContracts)
    .values(c)
    .onConflictDoUpdate({
      target: t.serviceContracts.id,
      set: { status: c.status, startDate: c.startDate, bridge: c.bridge, updatedAt: c.updatedAt },
    });
}

export async function findServiceContractByOrder(db: Exec, orderId: string) {
  const [c] = await db.select().from(t.serviceContracts).where(and(eq(t.serviceContracts.sourceOrderId, orderId)));
  return c ?? null;
}

import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  or,
} from "drizzle-orm"

import type { Exec } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { notFound } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { now, toDay } from "@/lib/time"

/**
 * Mock of the centrix API. The workflow engine reads portfolio data (units, leases,
 * parties) only through these functions, so the mock can be swapped for the real
 * centrix API later.
 */

/** A service contract on the unit: a confirmed service order. */
export type ServiceContract = {
  id: string
  order_id: string
  partner_id: string
  partner_name: string
  category: string
  product: string
  status: string
  start_date: string
  monthly_price_eur: string | null
  bridge: { product: string; until: string } | null
  consent: {
    data_shared: string[]
    given_at: Date
    channel: string
    revoked_at: Date | null
  }
  updated_at: Date
}

export type UnitSnapshot = {
  unit_id: string
  property: {
    id: string
    address: string
    street: string | null
    postcode: string | null
    city: string | null
    is_weg: boolean
    building_year: number | null
    heating: string | null
    energy_certificate: { class: string | null }
  }
  unit: {
    identifier: string
    floor: number | null
    size_sqm: number | null
    rooms: number | null
    meters: { type: string; number: string }[]
  }
  owner: { contact_id: string; name: string } | null
  tenant: {
    contact_id: string
    name: string
    email: string | null
    phone: string | null
    language: string
    whatsapp_opt_in: boolean
    move_in: string
  } | null
  contracts: {
    type: "lease"
    id: string
    rent_cold_eur: string
    start: string
    end: string | null
  }[]
  service_contracts: ServiceContract[]
}

export async function getUnitSnapshot(
  db: Exec,
  unitId: string
): Promise<UnitSnapshot> {
  if (!isUuid(unitId)) throw notFound(`unit ${unitId}`)
  const [row] = await db
    .select({ unit: t.units, building: t.buildings, property: t.properties })
    .from(t.units)
    .innerJoin(t.buildings, eq(t.units.buildingId, t.buildings.id))
    .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
    .where(eq(t.units.id, unitId))
  if (!row) throw notFound(`unit ${unitId}`)

  const today = toDay(now())
  const [meters, owners, leaseRows, contracts] = await Promise.all([
    db.select().from(t.meters).where(eq(t.meters.unitId, unitId)),
    db
      .select({ party: t.parties })
      .from(t.ownerships)
      .innerJoin(t.parties, eq(t.ownerships.partyId, t.parties.id))
      .where(
        // Current owner: ownership has started and not yet ended (a sale that takes
        // effect later doesn't change today's owner).
        and(
          eq(t.ownerships.unitId, unitId),
          lte(t.ownerships.validFrom, today),
          or(isNull(t.ownerships.validTo), gte(t.ownerships.validTo, today))
        )
      )
      .orderBy(desc(t.ownerships.validFrom)),
    db
      .select({ lease: t.leases, party: t.parties, role: t.leaseParties.role })
      .from(t.leases)
      .innerJoin(t.leaseParties, eq(t.leaseParties.leaseId, t.leases.id))
      .innerJoin(t.parties, eq(t.leaseParties.partyId, t.parties.id))
      .where(eq(t.leases.unitId, unitId))
      .orderBy(desc(t.leases.startDate)),
    listServiceContracts(db, unitId),
  ])

  // Primary tenant of the most recent lease that hasn't ended = the resident we talk
  // to (an upcoming move-in counts). A unit whose last lease has ended is vacant.
  const tenantRow = leaseRows.find(
    (l) =>
      l.role === "tenant" &&
      (l.lease.endDate === null || l.lease.endDate >= today)
  )
  const owner = owners[0]?.party ?? null
  const leases = [
    ...new Map(leaseRows.map((l) => [l.lease.id, l.lease])).values(),
  ]
  const p = row.property

  return {
    unit_id: row.unit.id,
    property: {
      id: p.id,
      address: p.address,
      street: p.street,
      postcode: p.postcode,
      city: p.city,
      is_weg: p.isWeg,
      building_year: row.building.buildingYear,
      heating: row.building.heatingType,
      energy_certificate: { class: row.building.energyClass },
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
          language: tenantRow.party.language ?? "de",
          whatsapp_opt_in: tenantRow.party.whatsappOptIn,
          move_in: tenantRow.lease.startDate,
        }
      : null,
    contracts: leases.map((l) => ({
      type: "lease" as const,
      id: l.id,
      rent_cold_eur: l.rentColdEur,
      start: l.startDate,
      end: l.endDate,
    })),
    service_contracts: contracts,
  }
}

/** Service orders the partner has confirmed, i.e. the results written back to the unit. */
export async function listServiceContracts(
  db: Exec,
  unitId: string
): Promise<ServiceContract[]> {
  const rows = await db
    .select({
      order: t.serviceOrders,
      partnerName: t.partners.name,
      category: t.partners.category,
      product: t.partnerOffers.product,
      consent: t.consents,
    })
    .from(t.serviceOrders)
    .innerJoin(t.partners, eq(t.serviceOrders.partnerId, t.partners.id))
    .innerJoin(t.partnerOffers, eq(t.serviceOrders.offerId, t.partnerOffers.id))
    .innerJoin(t.consents, eq(t.serviceOrders.consentId, t.consents.id))
    .where(
      and(
        eq(t.serviceOrders.unitId, unitId),
        isNotNull(t.serviceOrders.contractStatus)
      )
    )
    .orderBy(desc(t.serviceOrders.updatedAt))
  return rows.map((r) => ({
    id: r.order.id,
    order_id: r.order.id,
    partner_id: r.order.partnerId,
    partner_name: r.partnerName,
    category: r.category,
    product: r.product,
    status: r.order.contractStatus!,
    start_date: r.order.startDate,
    monthly_price_eur: r.order.monthlyPriceEur,
    bridge: r.order.bridge as ServiceContract["bridge"],
    consent: {
      data_shared: r.consent.dataShared,
      given_at: r.consent.givenAt,
      channel: r.consent.channel,
      revoked_at: r.consent.revokedAt,
    },
    updated_at: r.order.updatedAt,
  }))
}

export async function listUnits(db: Exec) {
  const rows = await db
    .select({
      id: t.units.id,
      identifier: t.units.identifier,
      propertyId: t.units.propertyId,
      street: t.properties.street,
      address: t.properties.address,
      city: t.properties.city,
    })
    .from(t.units)
    .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
    .orderBy(asc(t.properties.address), asc(t.units.identifier))
  return rows.map((r) => ({
    id: r.id,
    identifier: r.identifier,
    property_id: r.propertyId,
    street: r.street ?? r.address,
    city: r.city,
  }))
}

export async function getParty(db: Exec, partyId: string) {
  if (!isUuid(partyId)) return null
  const [p] = await db.select().from(t.parties).where(eq(t.parties.id, partyId))
  return p ?? null
}

export async function insertEvent(db: Exec, e: typeof t.events.$inferInsert) {
  await db.insert(t.events).values(e)
}

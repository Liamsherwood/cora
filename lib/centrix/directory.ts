import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"

import type { Exec } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { isUuid } from "@/lib/ids"

/**
 * Read model for the property manager's directory: every record the centrix mock holds
 * (properties, units, people, partners, workflows), searchable and paged. Read-only.
 */

export const DIRECTORY_PAGE_SIZE = 25

/** `%term%` for ILIKE with the user's wildcards escaped. */
function contains(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export async function getDirectoryCounts(db: Exec) {
  const [[properties], [units], [people], [partners], [workflows]] =
    await Promise.all([
      db.select({ n: count() }).from(t.properties),
      db.select({ n: count() }).from(t.units),
      db.select({ n: count() }).from(t.parties),
      db.select({ n: count() }).from(t.partners),
      db.select({ n: count() }).from(t.workflowRuns),
    ])
  return {
    properties: properties!.n,
    units: units!.n,
    people: people!.n,
    partners: partners!.n,
    workflows: workflows!.n,
  }
}

export type PersonRole =
  "tenant" | "co_tenant" | "guarantor" | "owner" | "mandate"

export type PersonRow = {
  id: string
  name: string
  type: string
  email: string | null
  phone: string | null
  roles: PersonRole[]
  units: { id: string; identifier: string; street: string }[]
}

/**
 * People (parties) by name, `pageSize + 1` rows so the caller can tell whether a next
 * page exists. Matches name, email or phone.
 */
export async function listPeople(
  db: Exec,
  { q = "", page = 1 }: { q?: string; page?: number }
): Promise<PersonRow[]> {
  const term = q.trim()
  const parties = await db
    .select({
      id: t.parties.id,
      name: t.parties.name,
      type: t.parties.type,
      email: t.parties.email,
      phone: t.parties.phone,
    })
    .from(t.parties)
    .where(
      term
        ? or(
            ilike(t.parties.name, contains(term)),
            ilike(t.parties.email, contains(term)),
            ilike(t.parties.phone, contains(term))
          )
        : undefined
    )
    .orderBy(asc(t.parties.name), asc(t.parties.id))
    .limit(DIRECTORY_PAGE_SIZE + 1)
    .offset((page - 1) * DIRECTORY_PAGE_SIZE)
  if (parties.length === 0) return []
  const ids = parties.map((p) => p.id)

  const unit = {
    id: t.units.id,
    identifier: t.units.identifier,
    street: sql<string>`coalesce(${t.properties.street}, ${t.properties.address})`,
  }
  const [leaseRoles, owned, mandated] = await Promise.all([
    db
      .select({
        partyId: t.leaseParties.partyId,
        role: t.leaseParties.role,
        ...unit,
      })
      .from(t.leaseParties)
      .innerJoin(t.leases, eq(t.leaseParties.leaseId, t.leases.id))
      .innerJoin(t.units, eq(t.leases.unitId, t.units.id))
      .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
      .where(inArray(t.leaseParties.partyId, ids)),
    db
      .select({ partyId: t.ownerships.partyId, ...unit })
      .from(t.ownerships)
      .innerJoin(t.units, eq(t.ownerships.unitId, t.units.id))
      .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
      .where(inArray(t.ownerships.partyId, ids)),
    db
      .select({ partyId: t.mandates.partyId })
      .from(t.mandates)
      .where(inArray(t.mandates.partyId, ids)),
  ])

  return parties.map((p) => {
    const roles = new Set<PersonRole>()
    const units = new Map<string, PersonRow["units"][number]>()
    for (const r of leaseRoles.filter((r) => r.partyId === p.id)) {
      roles.add(r.role as PersonRole)
      units.set(r.id, { id: r.id, identifier: r.identifier, street: r.street })
    }
    for (const r of owned.filter((r) => r.partyId === p.id)) {
      roles.add("owner")
      units.set(r.id, { id: r.id, identifier: r.identifier, street: r.street })
    }
    if (mandated.some((m) => m.partyId === p.id)) roles.add("mandate")
    return { ...p, roles: [...roles], units: [...units.values()] }
  })
}

/** One person with everything centrix links to them. Null for an unknown id. */
export async function getPerson(db: Exec, partyId: string) {
  if (!isUuid(partyId)) return null
  const [party] = await db
    .select()
    .from(t.parties)
    .where(eq(t.parties.id, partyId))
  if (!party) return null

  const [leases, ownerships, mandates, consents] = await Promise.all([
    db
      .select({
        leaseId: t.leases.id,
        role: t.leaseParties.role,
        rentColdEur: t.leases.rentColdEur,
        startDate: t.leases.startDate,
        endDate: t.leases.endDate,
        unitId: t.units.id,
        unit: t.units.identifier,
        address: t.properties.address,
      })
      .from(t.leaseParties)
      .innerJoin(t.leases, eq(t.leaseParties.leaseId, t.leases.id))
      .innerJoin(t.units, eq(t.leases.unitId, t.units.id))
      .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
      .where(eq(t.leaseParties.partyId, partyId))
      .orderBy(desc(t.leases.startDate)),
    db
      .select({
        meaShare: t.ownerships.meaShare,
        validFrom: t.ownerships.validFrom,
        validTo: t.ownerships.validTo,
        unitId: t.units.id,
        unit: t.units.identifier,
        address: t.properties.address,
      })
      .from(t.ownerships)
      .innerJoin(t.units, eq(t.ownerships.unitId, t.units.id))
      .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
      .where(eq(t.ownerships.partyId, partyId))
      .orderBy(desc(t.ownerships.validFrom)),
    db
      .select({
        id: t.mandates.id,
        type: t.mandates.type,
        approvalLimitEur: t.mandates.approvalLimitEur,
        address: t.properties.address,
      })
      .from(t.mandates)
      .innerJoin(t.properties, eq(t.mandates.propertyId, t.properties.id))
      .where(eq(t.mandates.partyId, partyId))
      .orderBy(asc(t.properties.address)),
    db
      .select({
        id: t.consents.id,
        partner: t.partners.name,
        dataShared: t.consents.dataShared,
        channel: t.consents.channel,
        givenAt: t.consents.givenAt,
        revokedAt: t.consents.revokedAt,
      })
      .from(t.consents)
      .innerJoin(t.partners, eq(t.consents.partnerId, t.partners.id))
      .where(eq(t.consents.partyId, partyId))
      .orderBy(desc(t.consents.givenAt)),
  ])
  return { party, leases, ownerships, mandates, consents }
}

/** Every connected partner with its offers and how much it has been used. */
export async function listPartners(db: Exec) {
  const [partners, offers, runs, orders] = await Promise.all([
    db.select().from(t.partners).orderBy(asc(t.partners.name)),
    db
      .select()
      .from(t.partnerOffers)
      .orderBy(asc(t.partnerOffers.monthlyPriceEur), asc(t.partnerOffers.key)),
    db
      .select({ partnerId: t.workflowRuns.partnerId, n: count() })
      .from(t.workflowRuns)
      .groupBy(t.workflowRuns.partnerId),
    db
      .select({ partnerId: t.serviceOrders.partnerId, n: count() })
      .from(t.serviceOrders)
      .groupBy(t.serviceOrders.partnerId),
  ])
  return partners.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    regions: p.regions,
    channels: p.channels,
    offers: offers.filter((o) => o.partnerId === p.id),
    workflows: runs.find((r) => r.partnerId === p.id)?.n ?? 0,
    orders: orders.find((o) => o.partnerId === p.id)?.n ?? 0,
  }))
}

/** All partner workflows across the portfolio, newest activity first (`pageSize + 1` rows). */
export async function listAllRuns(db: Exec, { page = 1 }: { page?: number }) {
  return db
    .select({
      id: t.workflowRuns.id,
      state: t.workflowRuns.state,
      updatedAt: t.workflowRuns.updatedAt,
      eventType: t.events.type,
      unitId: t.units.id,
      unit: t.units.identifier,
      address: t.properties.address,
      partyId: t.parties.id,
      party: t.parties.name,
      partner: t.partners.name,
    })
    .from(t.workflowRuns)
    .innerJoin(t.events, eq(t.workflowRuns.eventId, t.events.id))
    .innerJoin(t.units, eq(t.events.unitId, t.units.id))
    .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
    .leftJoin(t.parties, eq(t.events.partyId, t.parties.id))
    .leftJoin(t.partners, eq(t.workflowRuns.partnerId, t.partners.id))
    .orderBy(desc(t.workflowRuns.updatedAt), asc(t.workflowRuns.id))
    .limit(DIRECTORY_PAGE_SIZE + 1)
    .offset((page - 1) * DIRECTORY_PAGE_SIZE)
}

/** Unit ids whose current or future tenant matches `q`, for the unit search. */
export async function findUnitsByTenant(db: Exec, q: string) {
  const term = q.trim()
  if (!term) return []
  const rows = await db
    .selectDistinct({ unitId: t.leases.unitId })
    .from(t.leaseParties)
    .innerJoin(t.leases, eq(t.leaseParties.leaseId, t.leases.id))
    .innerJoin(t.parties, eq(t.leaseParties.partyId, t.parties.id))
    .where(
      and(
        inArray(t.leaseParties.role, ["tenant", "co_tenant"]),
        ilike(t.parties.name, contains(term))
      )
    )
  return rows.map((r) => r.unitId)
}

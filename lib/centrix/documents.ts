import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm"

import type { Exec } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { isUuid } from "@/lib/ids"
import { now, toDay } from "@/lib/time"

import type { getPerson } from "./directory"

/**
 * The documents a property manager keeps on file for a unit, a tenancy or a person.
 * Nothing is stored: each document is a template that is filled from the centrix records
 * when it is opened, so it always shows the names, addresses and figures on file.
 */

export const DOCUMENT_KINDS = [
  "lease",
  "registration",
  "rent_certificate",
  "handover",
  "guarantee",
  "management",
  "energy",
  "consent",
  "owner_sheet",
] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export function isDocumentKind(value: unknown): value is DocumentKind {
  return DOCUMENT_KINDS.some((kind) => kind === value)
}

/** The property manager that issues every document (the demo's own letterhead). */
export const ISSUER = {
  name: "Centrix Immobilienverwaltung",
  street: "Musterallee 1",
  postcode: "40212",
  city: "Düsseldorf",
  phone: "+49 211 0000100",
  email: "verwaltung@centrix.example",
} as const

/** File reference printed on a document, e.g. "MV-0000004B". */
const REF_PREFIX: Record<DocumentKind, string> = {
  lease: "MV",
  registration: "WGB",
  rent_certificate: "MB",
  handover: "UP",
  guarantee: "BG",
  management: "VV",
  energy: "EA",
  consent: "EW",
  owner_sheet: "ES",
}

export function documentRef(kind: DocumentKind, id: string, party?: string) {
  // The end of the id: the seed's fixed demo ids only differ there.
  const ref = `${REF_PREFIX[kind]}-${id.slice(-8).toUpperCase()}`
  // A lease can have several guarantors, each with their own guarantee.
  return party ? `${ref}-${party.slice(-4).toUpperCase()}` : ref
}

/** One entry in a document list; `party` picks the person on per-person documents. */
export type DocumentLink = {
  kind: DocumentKind
  id: string
  party?: string
  /** What the document is about, e.g. ["4B", "Musterstraße 12, 52062 Aachen"]. */
  context: string[]
  /** Number of units the document covers, where that is what tells it apart. */
  units?: number
  /** Energy efficiency class, for an energy certificate. */
  energyClass?: string
  /** A calendar day ("2026-12-01") or a moment the document refers to. */
  when: { day: string } | { at: Date } | null
}

export function documentHref(locale: string, link: DocumentLink) {
  const path = `/${locale}/documents/${link.kind}/${link.id}`
  return link.party ? `${path}?party=${link.party}` : path
}

const partyColumns = {
  id: t.parties.id,
  name: t.parties.name,
  type: t.parties.type,
  email: t.parties.email,
  phone: t.parties.phone,
}

export type DocumentParty = {
  id: string
  name: string
  type: string
  email: string | null
  phone: string | null
}

export type DocumentAddress = {
  /** Display address, e.g. "Musterstraße 12, 52062 Aachen". */
  address: string
  street: string | null
  postcode: string | null
  city: string | null
}

const addressOf = (p: typeof t.properties.$inferSelect): DocumentAddress => ({
  address: p.address,
  street: p.street,
  postcode: p.postcode,
  city: p.city,
})

const today = () => toDay(now())

/** Not ended yet (open-ended, or ending today or later). */
const isOngoing = (endDate: string | null, day: string) =>
  endDate === null || endDate >= day

/** Owner on `day`, else the next one after it, else the most recent one. */
function ownerOn<T extends { validFrom: string; validTo: string | null }>(
  owners: T[],
  day: string
) {
  return (
    owners.find(
      (o) => o.validFrom <= day && (o.validTo === null || o.validTo >= day)
    ) ??
    owners.find((o) => o.validFrom > day) ??
    owners.at(-1) ??
    null
  )
}

// --- Loaders: one record set per document kind ----------------------------------------

/** A tenancy with everyone on it: the source for lease, registration, certificate, handover. */
async function loadTenancy(db: Exec, leaseId: string) {
  if (!isUuid(leaseId)) return null
  const [row] = await db
    .select({ lease: t.leases, unit: t.units, property: t.properties })
    .from(t.leases)
    .innerJoin(t.units, eq(t.leases.unitId, t.units.id))
    .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
    .where(eq(t.leases.id, leaseId))
  if (!row) return null

  const [people, owners, meters] = await Promise.all([
    db
      .select({ party: partyColumns, role: t.leaseParties.role })
      .from(t.leaseParties)
      .innerJoin(t.parties, eq(t.leaseParties.partyId, t.parties.id))
      .where(eq(t.leaseParties.leaseId, leaseId))
      .orderBy(asc(t.parties.name), asc(t.parties.id)),
    db
      .select({
        party: partyColumns,
        validFrom: t.ownerships.validFrom,
        validTo: t.ownerships.validTo,
      })
      .from(t.ownerships)
      .innerJoin(t.parties, eq(t.ownerships.partyId, t.parties.id))
      .where(eq(t.ownerships.unitId, row.unit.id))
      .orderBy(asc(t.ownerships.validFrom), asc(t.parties.name)),
    db
      .select({ type: t.meters.type, number: t.meters.number })
      .from(t.meters)
      .where(eq(t.meters.unitId, row.unit.id))
      .orderBy(asc(t.meters.type), asc(t.meters.number)),
  ])

  // The main tenant first, then co-tenants; each person once.
  const byRole = (role: string) => people.filter((p) => p.role === role)
  const tenants = [
    ...new Map(
      [...byRole("tenant"), ...byRole("co_tenant")].map((p) => [
        p.party.id,
        p.party,
      ])
    ).values(),
  ]
  const guarantors = byRole("guarantor").map((p) => p.party)

  return {
    lease: {
      id: row.lease.id,
      rentColdEur: row.lease.rentColdEur,
      startDate: row.lease.startDate,
      endDate: row.lease.endDate,
    },
    unit: {
      identifier: row.unit.identifier,
      floor: row.unit.floor,
      sizeSqm: row.unit.sizeSqm,
      rooms: row.unit.rooms,
    },
    property: addressOf(row.property),
    // The landlord who let the flat: the owner when the tenancy began.
    landlord: ownerOn(owners, row.lease.startDate)?.party ?? null,
    tenants,
    guarantors,
    meters,
    today: today(),
  }
}

export type TenancyRecord = NonNullable<Awaited<ReturnType<typeof loadTenancy>>>

async function loadManagement(db: Exec, mandateId: string) {
  if (!isUuid(mandateId)) return null
  const [row] = await db
    .select({
      mandate: t.mandates,
      client: partyColumns,
      property: t.properties,
    })
    .from(t.mandates)
    .innerJoin(t.parties, eq(t.mandates.partyId, t.parties.id))
    .innerJoin(t.properties, eq(t.mandates.propertyId, t.properties.id))
    .where(eq(t.mandates.id, mandateId))
  if (!row) return null

  const day = today()
  const units = await db
    .select({
      id: t.units.id,
      identifier: t.units.identifier,
      floor: t.units.floor,
      sizeSqm: t.units.sizeSqm,
    })
    .from(t.units)
    .where(eq(t.units.propertyId, row.property.id))
    .orderBy(asc(t.units.identifier), asc(t.units.id))

  // WEG administration covers the whole property; rental management covers the units
  // the client owns there today.
  let covered = units
  if (row.mandate.type !== "weg") {
    const owned = await db
      .select({ unitId: t.ownerships.unitId })
      .from(t.ownerships)
      .where(
        and(
          eq(t.ownerships.partyId, row.client.id),
          inArray(
            t.ownerships.unitId,
            units.map((u) => u.id)
          ),
          lte(t.ownerships.validFrom, day),
          or(isNull(t.ownerships.validTo), gte(t.ownerships.validTo, day))
        )
      )
    const ids = new Set(owned.map((o) => o.unitId))
    covered = units.filter((u) => ids.has(u.id))
  }

  return {
    mandate: {
      id: row.mandate.id,
      type: row.mandate.type,
      approvalLimitEur: row.mandate.approvalLimitEur,
    },
    client: row.client,
    property: addressOf(row.property),
    propertyUnitCount: units.length,
    units: covered,
    today: day,
  }
}

export type ManagementRecord = NonNullable<
  Awaited<ReturnType<typeof loadManagement>>
>

async function loadEnergy(db: Exec, buildingId: string) {
  if (!isUuid(buildingId)) return null
  const [row] = await db
    .select({ building: t.buildings, property: t.properties })
    .from(t.buildings)
    .innerJoin(t.properties, eq(t.buildings.propertyId, t.properties.id))
    .where(eq(t.buildings.id, buildingId))
  if (!row || !row.building.energyClass) return null

  const [siblings, units] = await Promise.all([
    db
      .select({ id: t.buildings.id })
      .from(t.buildings)
      .where(eq(t.buildings.propertyId, row.property.id))
      .orderBy(asc(t.buildings.id)),
    db
      .select({ sizeSqm: t.units.sizeSqm })
      .from(t.units)
      .where(eq(t.units.buildingId, buildingId)),
  ])

  return {
    building: {
      id: row.building.id,
      buildingYear: row.building.buildingYear,
      heatingType: row.building.heatingType,
      energyClass: row.building.energyClass,
      /** 1-based position among the property's buildings, when there are several. */
      number:
        siblings.length > 1
          ? siblings.findIndex((b) => b.id === buildingId) + 1
          : null,
      of: siblings.length,
    },
    property: addressOf(row.property),
    unitCount: units.length,
    livingSpaceSqm: units.reduce((sum, u) => sum + (u.sizeSqm ?? 0), 0),
    today: today(),
  }
}

export type EnergyRecord = NonNullable<Awaited<ReturnType<typeof loadEnergy>>>

async function loadConsent(db: Exec, consentId: string) {
  if (!isUuid(consentId)) return null
  const [row] = await db
    .select({
      consent: t.consents,
      party: partyColumns,
      partner: { name: t.partners.name, category: t.partners.category },
      offer: t.workflowRuns.offer,
      unit: t.units.identifier,
      property: t.properties,
    })
    .from(t.consents)
    .innerJoin(t.parties, eq(t.consents.partyId, t.parties.id))
    .innerJoin(t.partners, eq(t.consents.partnerId, t.partners.id))
    .leftJoin(t.workflowRuns, eq(t.consents.workflowRunId, t.workflowRuns.id))
    .leftJoin(t.events, eq(t.workflowRuns.eventId, t.events.id))
    .leftJoin(t.units, eq(t.events.unitId, t.units.id))
    .leftJoin(t.properties, eq(t.units.propertyId, t.properties.id))
    .where(eq(t.consents.id, consentId))
  if (!row) return null

  const product = (row.offer as { product?: unknown } | null)?.product
  return {
    consent: {
      id: row.consent.id,
      dataShared: row.consent.dataShared,
      purpose: row.consent.purpose,
      channel: row.consent.channel,
      givenAt: row.consent.givenAt,
      revokedAt: row.consent.revokedAt,
    },
    party: row.party,
    partner: row.partner,
    product: typeof product === "string" ? product : null,
    unit: row.unit,
    property: row.property ? addressOf(row.property) : null,
    today: today(),
  }
}

export type ConsentRecord = NonNullable<Awaited<ReturnType<typeof loadConsent>>>

async function loadOwnerSheet(db: Exec, partyId: string) {
  if (!isUuid(partyId)) return null
  const [party] = await db
    .select(partyColumns)
    .from(t.parties)
    .where(eq(t.parties.id, partyId))
  if (!party) return null

  const [ownerships, mandates] = await Promise.all([
    db
      .select({
        unit: t.units.identifier,
        sizeSqm: t.units.sizeSqm,
        address: t.properties.address,
        meaShare: t.ownerships.meaShare,
        validFrom: t.ownerships.validFrom,
        validTo: t.ownerships.validTo,
      })
      .from(t.ownerships)
      .innerJoin(t.units, eq(t.ownerships.unitId, t.units.id))
      .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
      .where(eq(t.ownerships.partyId, partyId))
      .orderBy(
        asc(t.properties.address),
        asc(t.units.identifier),
        asc(t.ownerships.validFrom)
      ),
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
  ])
  if (ownerships.length === 0) return null
  return { party, ownerships, mandates, today: today() }
}

export type OwnerSheetRecord = NonNullable<
  Awaited<ReturnType<typeof loadOwnerSheet>>
>

export type DocumentRecord =
  | {
      kind: "lease" | "registration" | "rent_certificate" | "handover"
      data: TenancyRecord
    }
  | { kind: "guarantee"; data: TenancyRecord; guarantor: DocumentParty }
  | { kind: "management"; data: ManagementRecord }
  | { kind: "energy"; data: EnergyRecord }
  | { kind: "consent"; data: ConsentRecord }
  | { kind: "owner_sheet"; data: OwnerSheetRecord }

/** Fills one document from the records. Null when it doesn't exist or doesn't apply. */
export async function loadDocument(
  db: Exec,
  kind: DocumentKind,
  id: string,
  party?: string
): Promise<DocumentRecord | null> {
  switch (kind) {
    case "lease":
    case "registration":
    case "rent_certificate":
    case "handover": {
      const data = await loadTenancy(db, id)
      return data && data.tenants.length > 0 ? { kind, data } : null
    }
    case "guarantee": {
      const data = await loadTenancy(db, id)
      const guarantor = data?.guarantors.find((g) => g.id === party)
      return data && guarantor ? { kind, data, guarantor } : null
    }
    case "management": {
      const data = await loadManagement(db, id)
      return data && { kind, data }
    }
    case "energy": {
      const data = await loadEnergy(db, id)
      return data && { kind, data }
    }
    case "consent": {
      const data = await loadConsent(db, id)
      return data && { kind, data }
    }
    case "owner_sheet": {
      const data = await loadOwnerSheet(db, id)
      return data && { kind, data }
    }
  }
}

// --- Document lists ---------------------------------------------------------------------

/** The documents of one tenancy, as listed for a unit or a tenant. */
function tenancyLinks(
  lease: { leaseId: string; startDate: string },
  context: string[],
  day: string
): DocumentLink[] {
  const when = { day: lease.startDate }
  const kinds: DocumentKind[] = ["lease", "registration", "rent_certificate"]
  // The handover report is prepared ahead of a move-in that hasn't happened yet.
  if (lease.startDate > day) kinds.push("handover")
  return kinds.map((kind) => ({ kind, id: lease.leaseId, context, when }))
}

/**
 * Documents on file for a unit: its current or upcoming tenancies (with any rent
 * guarantees), the building's energy certificate and the management agreements that
 * cover it.
 */
export async function listUnitDocuments(
  db: Exec,
  unitId: string
): Promise<DocumentLink[]> {
  if (!isUuid(unitId)) return []
  const [unit] = await db
    .select({
      buildingId: t.units.buildingId,
      propertyId: t.units.propertyId,
      energyClass: t.buildings.energyClass,
    })
    .from(t.units)
    .innerJoin(t.buildings, eq(t.units.buildingId, t.buildings.id))
    .where(eq(t.units.id, unitId))
  if (!unit) return []

  const day = today()
  const [people, mandates, owners] = await Promise.all([
    db
      .select({
        leaseId: t.leases.id,
        startDate: t.leases.startDate,
        endDate: t.leases.endDate,
        partyId: t.parties.id,
        name: t.parties.name,
        role: t.leaseParties.role,
      })
      .from(t.leases)
      .innerJoin(t.leaseParties, eq(t.leaseParties.leaseId, t.leases.id))
      .innerJoin(t.parties, eq(t.leaseParties.partyId, t.parties.id))
      .where(
        and(
          eq(t.leases.unitId, unitId),
          or(isNull(t.leases.endDate), gte(t.leases.endDate, day))
        )
      )
      .orderBy(asc(t.leases.startDate), asc(t.parties.name)),
    db
      .select({
        id: t.mandates.id,
        type: t.mandates.type,
        partyId: t.parties.id,
        name: t.parties.name,
      })
      .from(t.mandates)
      .innerJoin(t.parties, eq(t.mandates.partyId, t.parties.id))
      .where(eq(t.mandates.propertyId, unit.propertyId))
      .orderBy(asc(t.mandates.type), asc(t.parties.name)),
    db
      .select({ partyId: t.ownerships.partyId })
      .from(t.ownerships)
      .where(
        and(
          eq(t.ownerships.unitId, unitId),
          lte(t.ownerships.validFrom, day),
          or(isNull(t.ownerships.validTo), gte(t.ownerships.validTo, day))
        )
      ),
  ])

  const links: DocumentLink[] = []
  const leaseIds = [...new Set(people.map((p) => p.leaseId))]
  for (const leaseId of leaseIds) {
    const onLease = people.filter((p) => p.leaseId === leaseId)
    const lease = onLease[0]!
    const tenants = onLease
      .filter((p) => p.role === "tenant" || p.role === "co_tenant")
      .sort((a, b) => Number(b.role === "tenant") - Number(a.role === "tenant"))
    if (tenants.length === 0) continue
    links.push(
      ...tenancyLinks(lease, [tenants.map((p) => p.name).join(", ")], day)
    )
    for (const g of onLease.filter((p) => p.role === "guarantor"))
      links.push({
        kind: "guarantee",
        id: leaseId,
        party: g.partyId,
        context: [g.name],
        when: { day: lease.startDate },
      })
  }

  if (unit.energyClass)
    links.push({
      kind: "energy",
      id: unit.buildingId,
      context: [],
      energyClass: unit.energyClass,
      when: null,
    })

  const ownerIds = new Set(owners.map((o) => o.partyId))
  for (const m of mandates)
    if (m.type === "weg" || ownerIds.has(m.partyId))
      links.push({
        kind: "management",
        id: m.id,
        context: [m.name],
        when: null,
      })

  return links
}

type Person = NonNullable<Awaited<ReturnType<typeof getPerson>>>

/** Documents on file for a person, built from what the directory already loaded. */
export function personDocuments({
  party,
  leases,
  ownerships,
  mandates,
  consents,
}: Person): DocumentLink[] {
  const day = today()
  const links: DocumentLink[] = []
  const tenancies = new Set<string>()
  for (const l of leases) {
    const context = [l.unit, l.address]
    if (l.role === "guarantor")
      links.push({
        kind: "guarantee",
        id: l.leaseId,
        party: party.id,
        context,
        when: { day: l.startDate },
      })
    else if (
      (l.role === "tenant" || l.role === "co_tenant") &&
      !tenancies.has(l.leaseId)
    ) {
      tenancies.add(l.leaseId)
      links.push(...tenancyLinks(l, context, day))
    }
  }
  if (ownerships.length > 0)
    links.push({
      kind: "owner_sheet",
      id: party.id,
      context: [],
      units: new Set(ownerships.map((o) => o.unitId)).size,
      when: null,
    })
  for (const m of mandates)
    links.push({
      kind: "management",
      id: m.id,
      context: [m.address],
      when: null,
    })
  for (const c of consents)
    links.push({
      kind: "consent",
      id: c.id,
      context: [c.partner],
      when: { at: c.givenAt },
    })
  return links
}

/** Whether a tenancy runs today, starts later or has ended. */
export function tenancyStatus(
  lease: { startDate: string; endDate: string | null },
  day: string
): "current" | "upcoming" | "ended" {
  if (lease.startDate > day) return "upcoming"
  return isOngoing(lease.endDate, day) ? "current" : "ended"
}

/** A document in the property manager's files, as listed in the directory's Documents tab. */
export type FiledDocument = DocumentLink & {
  /** Who the document is for: tenants, guarantor, client, owner or consenting tenant. */
  subject: string | null
  /** The property (and unit) the document is about; none for an owner's record sheet. */
  place: { address: string; unit: string | null } | null
  /** Position among the property's buildings, when it has several. */
  building?: { number: number; of: number }
}

const byText = new Intl.Collator("de", { numeric: true, sensitivity: "base" })

/** Property, then unit, then document type, newest first, then name. */
function compareFiled(a: FiledDocument, b: FiledDocument) {
  if (a.place && !b.place) return -1
  if (!a.place && b.place) return 1
  const key = (d: FiledDocument) =>
    !d.when ? "" : "day" in d.when ? d.when.day : d.when.at.toISOString()
  return (
    byText.compare(a.place?.address ?? "", b.place?.address ?? "") ||
    byText.compare(a.place?.unit ?? "", b.place?.unit ?? "") ||
    (a.building?.number ?? 0) - (b.building?.number ?? 0) ||
    DOCUMENT_KINDS.indexOf(a.kind) - DOCUMENT_KINDS.indexOf(b.kind) ||
    key(b).localeCompare(key(a)) ||
    byText.compare(a.subject ?? "", b.subject ?? "")
  )
}

/**
 * Every document on file across the portfolio: the same documents the unit and person
 * panels list, plus those of past tenancies, which stay in the files.
 */
export async function listFiledDocuments(db: Exec): Promise<FiledDocument[]> {
  const day = today()
  const [leases, people, buildings, mandates, consents, ownerships] =
    await Promise.all([
      db
        .select({
          leaseId: t.leases.id,
          startDate: t.leases.startDate,
          unit: t.units.identifier,
          address: t.properties.address,
        })
        .from(t.leases)
        .innerJoin(t.units, eq(t.leases.unitId, t.units.id))
        .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id)),
      db
        .select({
          leaseId: t.leaseParties.leaseId,
          partyId: t.parties.id,
          name: t.parties.name,
          role: t.leaseParties.role,
        })
        .from(t.leaseParties)
        .innerJoin(t.parties, eq(t.leaseParties.partyId, t.parties.id))
        .orderBy(asc(t.parties.name)),
      db
        .select({
          id: t.buildings.id,
          propertyId: t.buildings.propertyId,
          energyClass: t.buildings.energyClass,
          address: t.properties.address,
        })
        .from(t.buildings)
        .innerJoin(t.properties, eq(t.buildings.propertyId, t.properties.id))
        .orderBy(asc(t.buildings.id)),
      db
        .select({
          id: t.mandates.id,
          name: t.parties.name,
          address: t.properties.address,
        })
        .from(t.mandates)
        .innerJoin(t.parties, eq(t.mandates.partyId, t.parties.id))
        .innerJoin(t.properties, eq(t.mandates.propertyId, t.properties.id)),
      db
        .select({
          id: t.consents.id,
          givenAt: t.consents.givenAt,
          name: t.parties.name,
          partner: t.partners.name,
          unit: t.units.identifier,
          address: t.properties.address,
        })
        .from(t.consents)
        .innerJoin(t.parties, eq(t.consents.partyId, t.parties.id))
        .innerJoin(t.partners, eq(t.consents.partnerId, t.partners.id))
        .leftJoin(
          t.workflowRuns,
          eq(t.consents.workflowRunId, t.workflowRuns.id)
        )
        .leftJoin(t.events, eq(t.workflowRuns.eventId, t.events.id))
        .leftJoin(t.units, eq(t.events.unitId, t.units.id))
        .leftJoin(t.properties, eq(t.units.propertyId, t.properties.id)),
      db
        .select({
          partyId: t.ownerships.partyId,
          unitId: t.ownerships.unitId,
          name: t.parties.name,
        })
        .from(t.ownerships)
        .innerJoin(t.parties, eq(t.ownerships.partyId, t.parties.id)),
    ])

  const filed: FiledDocument[] = []
  const onLease = Map.groupBy(people, (p) => p.leaseId)
  for (const lease of leases) {
    const parties = onLease.get(lease.leaseId) ?? []
    const tenants = parties
      .filter((p) => p.role === "tenant" || p.role === "co_tenant")
      .sort((a, b) => Number(b.role === "tenant") - Number(a.role === "tenant"))
    // A lease without a tenant on record has nothing to fill in.
    if (tenants.length === 0) continue
    const place = { address: lease.address, unit: lease.unit }
    const subject = tenants.map((p) => p.name).join(", ")
    for (const link of tenancyLinks(lease, [subject], day))
      filed.push({ ...link, subject, place })
    for (const g of parties.filter((p) => p.role === "guarantor"))
      filed.push({
        kind: "guarantee",
        id: lease.leaseId,
        party: g.partyId,
        context: [g.name],
        when: { day: lease.startDate },
        subject: g.name,
        place,
      })
  }

  const perProperty = Map.groupBy(buildings, (b) => b.propertyId)
  for (const b of buildings) {
    if (!b.energyClass) continue
    const siblings = perProperty.get(b.propertyId)!
    filed.push({
      kind: "energy",
      id: b.id,
      context: [],
      energyClass: b.energyClass,
      when: null,
      subject: null,
      place: { address: b.address, unit: null },
      building:
        siblings.length > 1
          ? {
              number: siblings.findIndex((s) => s.id === b.id) + 1,
              of: siblings.length,
            }
          : undefined,
    })
  }

  for (const m of mandates)
    filed.push({
      kind: "management",
      id: m.id,
      context: [m.name],
      when: null,
      subject: m.name,
      place: { address: m.address, unit: null },
    })

  for (const c of consents)
    filed.push({
      kind: "consent",
      id: c.id,
      context: [c.partner],
      when: { at: c.givenAt },
      subject: `${c.name} · ${c.partner}`,
      place: c.address ? { address: c.address, unit: c.unit } : null,
    })

  for (const [partyId, owned] of Map.groupBy(ownerships, (o) => o.partyId))
    filed.push({
      kind: "owner_sheet",
      id: partyId,
      context: [],
      units: new Set(owned.map((o) => o.unitId)).size,
      when: null,
      subject: owned[0]!.name,
      place: null,
    })

  return filed.sort(compareFiled)
}

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { documentFormat } from "@/components/documents/format"
import { DocumentBody } from "@/components/documents/templates"
import { getPerson } from "@/lib/centrix/directory"
import {
  documentRef,
  listUnitDocuments,
  loadDocument,
  personDocuments,
  type DocumentRecord,
} from "@/lib/centrix/documents"
import type { DB } from "@/lib/db"
import de from "@/lib/i18n/de"
import en from "@/lib/i18n/en"
import { newId } from "@/lib/ids"
import { readSeedFile } from "@/lib/seed"
import { acceptOffer, markOfferSent, triggerEvent } from "@/lib/workflow/engine"

import { closeDb, LENA, resetDb, UNIT_4B } from "./helpers"

const LEASE_4B = "50000000-0000-4000-8000-00000000004b"
const MARIA = "40000000-0000-4000-8000-000000000101"
const RENTAL_MANDATE = "60000000-0000-4000-8000-000000000002"
const WEG_MANDATE = "60000000-0000-4000-8000-000000000001"
const BUILDING_12 = "20000000-0000-4000-8000-000000000012"

/** The filled document as plain text, the way a reader sees it. */
function render(record: DocumentRecord, locale: "en" | "de" = "en") {
  const m = (locale === "en" ? en : de).documents
  const html = renderToStaticMarkup(
    createElement(DocumentBody, { record, m, f: documentFormat(locale, m) })
  )
  const text = html
    .replace(/<br\/?>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
  // Every placeholder is filled and no missing value leaks into the text.
  expect(text).not.toMatch(/[{}]|NaN|undefined|null/)
  return text
}

async function load(
  ...args: Parameters<typeof loadDocument> extends [unknown, ...infer Rest]
    ? Rest
    : never
) {
  const record = await loadDocument(db, ...args)
  expect(record).not.toBeNull()
  return record!
}

let db: DB
beforeAll(async () => {
  db = await resetDb()
})
afterAll(closeDb)

describe("documents", () => {
  it("lists the tenancy, building and management documents of a unit", async () => {
    const links = await listUnitDocuments(db, UNIT_4B)
    expect(links.map((l) => `${l.kind}:${l.id}`)).toEqual([
      `lease:${LEASE_4B}`,
      `registration:${LEASE_4B}`,
      `rent_certificate:${LEASE_4B}`,
      // Lena moves in on 1 Dec, after the pinned demo day: the handover is prepared.
      `handover:${LEASE_4B}`,
      `energy:${BUILDING_12}`,
      // Maria Becker's rental management covers 4B; the WEG mandate the whole property.
      `management:${RENTAL_MANDATE}`,
      `management:${WEG_MANDATE}`,
    ])
    expect(links[0]).toMatchObject({
      context: ["Lena Hoffmann"],
      when: { day: "2026-12-01" },
    })
  })

  it("fills the lease from the unit, owner, tenant and rent on file", async () => {
    const text = render(await load("lease", LEASE_4B))
    for (const part of [
      "Landlord Maria Becker",
      "Tenant Lena Hoffmann",
      "Musterstraße 12, 52062 Aachen",
      "Flat 4B, 2nd floor",
      "approx. 68 m²",
      "Electricity · 1ESY1160123456",
      "begins on 1 December 2026",
      "net rent, excluding operating costs, is €780.00",
      "three monthly net rents (€2,340.00)",
      "Tenant: Lena Hoffmann",
    ])
      expect(text).toContain(part)
  })

  it("gives every demo document its own file reference", () => {
    // The seed's fixed ids share their first 8 characters; references must not.
    expect(documentRef("lease", LEASE_4B)).toBe("MV-0000004B")
    expect(documentRef("lease", "50000000-0000-4000-8000-00000000002a")).toBe(
      "MV-0000002A"
    )
  })

  it("fills the Wohnungsgeberbestätigung in German", async () => {
    const text = render(await load("registration", LEASE_4B), "de")
    expect(text).toContain(
      "Maria Becker, c/o Centrix Immobilienverwaltung, Musterallee 1, 40212 Düsseldorf"
    )
    expect(text).toContain("Einzug am 1. Dezember 2026")
    expect(text).toContain("Wohnung 4B, 2. Obergeschoss")
    // Issued in advance of the move-in: dated on the (pinned) day it is opened.
    expect(text).toContain("Düsseldorf, den 20. November 2026")
  })

  it("words the rent certificate for upcoming and ended tenancies", async () => {
    const upcoming = render(await load("rent_certificate", LEASE_4B))
    expect(upcoming).toContain("is let to Lena Hoffmann from 1 December 2026")

    const seed = await readSeedFile()
    const ended = seed.leases.find(
      (l) => l.end_date && l.end_date < "2026-11-20"
    )!
    const text = render(await load("rent_certificate", ended.id))
    expect(text).toContain("was let to")
    expect(text).toContain("Ended on")
  })

  it("only fills a rent guarantee for the lease's own guarantor", async () => {
    const seed = await readSeedFile()
    const g = seed.lease_parties.find((p) => p.role === "guarantor")!
    const lease = seed.leases.find((l) => l.id === g.lease_id)!
    const guarantor = seed.parties.find((p) => p.id === g.party_id)!

    expect(await loadDocument(db, "guarantee", lease.id, LENA)).toBeNull()
    const record = await load("guarantee", lease.id, g.party_id)
    const text = render(record)
    expect(text).toContain(`Guarantor ${guarantor.name}`)
    const cap = new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: "EUR",
    }).format(Number(lease.rent_cold_eur) * 3)
    expect(text).toContain(`limited to ${cap}`)
    // The lease names the guarantee as its security instead of a cash deposit.
    expect(render(await load("lease", lease.id))).toContain(
      `rent guarantee from ${guarantor.name}`
    )
  })

  it("covers only the client's own units in a rental management agreement", async () => {
    const record = await load("management", RENTAL_MANDATE)
    if (record.kind !== "management") throw new Error(record.kind)
    expect(record.data.client.name).toBe("Maria Becker")
    expect(record.data.units.map((u) => u.identifier)).toEqual(["2A", "4B"])
    expect(render(record)).toContain(
      "€300.00 without the client’s prior approval"
    )

    const weg = render(await load("management", WEG_MANDATE), "de")
    expect(weg).toContain("Verwaltervertrag für die Gemeinschaft")
    expect(weg).toContain("Einzelaufträge bis 500,00 €")
  })

  it("shows the building's energy class on the GEG scale", async () => {
    const text = render(await load("energy", BUILDING_12), "de")
    expect(text).toContain("Energieeffizienzklasse E")
    expect(text).toContain("Endenergie in dieser Klasse: 130 bis unter 160")
    expect(text).toContain("Baujahr 1972")
    expect(text).toContain("Gas-Zentralheizung")
  })

  it("gives co-ownership shares in thousandths, whichever way they are stored", async () => {
    const f = documentFormat("en", en.documents)
    expect(f.mea("68.5")).toBe("68.5/1,000")
    expect(f.mea("0.05303416")).toBe("53.03/1,000")
    expect(documentFormat("de", de.documents).mea("0.05303416")).toBe(
      "53,03/1.000"
    )
    expect(f.mea(null)).toBeNull()

    const text = render(await load("owner_sheet", MARIA))
    expect(text).toContain("Owner Maria Becker")
    expect(text).toContain("68.5/1,000")
  })

  it("records the consent a tenant gave, with exactly the fields shared", async () => {
    const { runs } = await triggerEvent(db, {
      id: newId(),
      type: "tenant.move_in",
      unit_id: UNIT_4B,
      party_id: LENA,
      payload: { move_in_date: "2026-12-01" },
    })
    const run = runs.find((r) => r.partner_slug === "example_fibre")!
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" })
    await acceptOffer(db, run.id, { channel: "portal" })

    const lena = (await getPerson(db, LENA))!
    const links = personDocuments(lena)
    const consent = links.find((l) => l.kind === "consent")!
    expect(links.map((l) => l.kind)).toEqual([
      "lease",
      "registration",
      "rent_certificate",
      "handover",
      "consent",
    ])

    const record = await load("consent", consent.id)
    const text = render(record)
    expect(text).toContain("Data subject Lena Hoffmann")
    expect(text).toContain("Given via Tenant portal")
    expect(text).toContain("Status Active")
    expect(text).toContain("Flat Musterstraße 12, 52062 Aachen Flat 4B")
    if (record.kind !== "consent") throw new Error(record.kind)
    for (const field of record.data.consent.dataShared)
      expect(text).toContain(
        en.documents.consent.fields[
          field as keyof typeof en.documents.consent.fields
        ]
      )
  })

  it("returns nothing for unknown or inapplicable documents", async () => {
    expect(await loadDocument(db, "lease", "not-a-uuid")).toBeNull()
    expect(await loadDocument(db, "lease", newId())).toBeNull()
    // Lena owns nothing, so she has no owner record sheet.
    expect(await loadDocument(db, "owner_sheet", LENA)).toBeNull()
    expect(await listUnitDocuments(db, newId())).toEqual([])
  })
})

import { describe, expect, it } from "vitest"

import type { UnitSnapshot } from "@/lib/centrix/repository"
import {
  loadManifestFiles,
  validateManifest,
  type RegisteredPartner,
} from "@/lib/connectors/registry"
import { centsToEur, eurToCents } from "@/lib/money"
import { sign, verify } from "@/lib/partner/signature"
import { addBusinessDays, businessDaysBetween } from "@/lib/time"
import { buildSharedPayload } from "@/lib/workflow/minimize"
import { computeOffer } from "@/lib/workflow/offers"

const snapshot: UnitSnapshot = {
  unit_id: "u",
  property: {
    id: "p",
    address: "Musterstraße 12, 52062 Aachen",
    street: "Musterstraße 12",
    postcode: "52062",
    city: "Aachen",
    is_weg: true,
    building_year: 1972,
    heating: "gas",
    energy_certificate: { class: "E" },
  },
  unit: {
    identifier: "4B",
    floor: 2,
    size_sqm: 68,
    rooms: 3,
    meters: [{ type: "electricity", number: "1ESY1160123456" }],
  },
  owner: { contact_id: "o", name: "Maria Becker" },
  tenant: {
    contact_id: "t",
    name: "Liam Hoffmann",
    email: "liam@example.com",
    phone: "+49",
    language: "de",
    whatsapp_opt_in: true,
    move_in: "2026-12-01",
  },
  contracts: [
    {
      type: "lease",
      id: "l",
      rent_cold_eur: "780.00",
      start: "2026-12-01",
      end: null,
    },
  ],
  service_contracts: [],
}

async function fibre(): Promise<RegisteredPartner> {
  const m = (await loadManifestFiles()).find(
    (r) => r.ok && r.manifest.id === "example_fibre"
  )
  if (!m?.ok) throw new Error("fixture")
  return {
    partnerId: "partner-uuid",
    slug: m.manifest.id,
    manifest: m.manifest,
    offerIds: Object.fromEntries(
      m.manifest.offers.map((o) => [o.id, `${o.id}-uuid`])
    ),
  }
}

describe("business days", () => {
  it("counts the reltix example window correctly (Fri 20 Nov -> Tue 1 Dec)", () => {
    expect(businessDaysBetween("2026-11-20", "2026-12-01")).toBe(7)
    expect(addBusinessDays("2026-11-20", 10)).toBe("2026-12-04")
  })
  it("skips Christmas", () => {
    expect(addBusinessDays("2026-12-23", 2)).toBe("2026-12-28")
  })
})

describe("money", () => {
  it("converts between cents and EUR decimals without floating point", () => {
    expect(centsToEur(3499)).toBe("34.99")
    expect(centsToEur(5)).toBe("0.05")
    expect(centsToEur(30, 4)).toBe("0.3000")
    expect(eurToCents("34.99")).toBe(3499)
    expect(eurToCents("0.3000")).toBe(30)
    expect(eurToCents("0.305")).toBe(31)
    expect(eurToCents("780")).toBe(78000)
  })
})

describe("connector spec", () => {
  it("all shipped manifests are valid", async () => {
    const results = await loadManifestFiles()
    expect(results.length).toBeGreaterThanOrEqual(2)
    for (const r of results) expect(r.ok, JSON.stringify(r)).toBe(true)
  })
  it("rejects a broken manifest with readable errors", async () => {
    const [first] = await loadManifestFiles()
    if (!first?.ok) throw new Error("fixture")
    const v1 = validateManifest({
      ...first.manifest,
      required_context: ["name", "iban"],
    })
    expect(v1.ok).toBe(false)
    if (!v1.ok)
      expect(v1.errors.some((e) => e.startsWith("required_context"))).toBe(true)
    const v2 = validateManifest({
      ...first.manifest,
      offers: [first.manifest.offers[0], first.manifest.offers[0]],
    })
    expect(v2.ok).toBe(false)
    if (!v2.ok)
      expect(v2.errors.some((e) => e.includes("duplicate offer"))).toBe(true)
  })
})

describe("offer computation", () => {
  it("fibre can't be live by move-in, so the bridge covers the gap", async () => {
    const { offer } = computeOffer(
      await fibre(),
      snapshot,
      "2026-11-20",
      "2026-12-01"
    )
    expect(offer?.on_time).toBe(false)
    expect(offer?.start_date).toBe("2026-12-04")
    expect(offer?.bridge?.ready_by).toBe("2026-11-24")
    expect(offer?.db_offer_id).toBe("fibre_500-uuid")
  })
  it("is on time when ordered early enough", async () => {
    const { offer } = computeOffer(
      await fibre(),
      snapshot,
      "2026-11-02",
      "2026-12-01"
    )
    expect(offer?.on_time).toBe(true)
    expect(offer?.start_date).toBe("2026-12-01")
    expect(offer?.bridge).toBeNull()
  })
  it("respects postcode eligibility", async () => {
    const res = computeOffer(
      await fibre(),
      { ...snapshot, property: { ...snapshot.property, postcode: "10115" } },
      "2026-11-20",
      "2026-12-01"
    )
    expect(res.offer).toBeNull()
    expect(res.ineligible[0]?.reasons).toContain("postcode not covered")
  })
})

describe("data minimisation", () => {
  it("shares only consented fields, never rent or owner", () => {
    const { payload, missing } = buildSharedPayload(snapshot, [
      "name",
      "address",
      "move_in_date",
    ])
    expect(Object.keys(payload).sort()).toEqual([
      "address",
      "move_in_date",
      "name",
    ])
    expect(JSON.stringify(payload)).not.toContain("Maria")
    expect(JSON.stringify(payload)).not.toContain("780")
    expect(missing).toEqual([])
  })
  it("reports missing data instead of sending nulls or half an address", () => {
    expect(
      buildSharedPayload(
        { ...snapshot, unit: { ...snapshot.unit, meters: [] } },
        ["meter_number"]
      ).missing
    ).toEqual(["meter_number"])
    expect(
      buildSharedPayload(
        { ...snapshot, property: { ...snapshot.property, postcode: null } },
        ["address"]
      ).missing
    ).toEqual(["address"])
  })
})

describe("webhook signature", () => {
  const body = JSON.stringify({ a: 1 })
  it("accepts a valid signature", () =>
    expect(verify("s", body, sign("s", body))).toBe(true))
  it("rejects wrong secret, tampered body, missing header, expired timestamp", () => {
    expect(verify("x", body, sign("s", body))).toBe(false)
    expect(verify("s", body + " ", sign("s", body))).toBe(false)
    expect(verify("s", body, null)).toBe(false)
    const old = Math.floor(Date.now() / 1000) - 3600
    expect(verify("s", body, sign("s", body, old))).toBe(false)
  })
})

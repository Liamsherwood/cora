import { describe, expect, it } from "vitest";
import { addBusinessDays, businessDaysBetween } from "@/lib/time";
import { loadManifestFiles, validateManifest } from "@/connectors/registry";
import { computeOffer } from "@/workflow/offers";
import { buildSharedPayload } from "@/workflow/minimize";
import { sign, verify } from "@/partner/signature";
import type { UnitSnapshot } from "@/centrix/repository";

const snapshot: UnitSnapshot = {
  unit_id: "unit_4b",
  property: { id: "p", address: "Musterstraße 12, 52062 Aachen", street: "Musterstraße 12", postcode: "52062", city: "Aachen", is_weg: true, building_year: 1972, heating: "gas", energy_certificate: { class: "E", valid_until: null } },
  unit: { identifier: "4B", floor: 2, size_sqm: 68, rooms: 3, meters: [{ type: "electricity", number: "1ESY1160123456" }] },
  owner: { contact_id: "c_101", name: "Maria Becker" },
  tenant: { contact_id: "c_202", name: "Lena Hoffmann", email: "lena@example.com", phone: "+49", language: "de", whatsapp_opt_in: true, move_in: "2026-12-01" },
  contracts: [{ type: "lease", id: "l", rent_cold_eur: 780, start: "2026-12-01", end: null }],
  service_contracts: [],
};

describe("business days", () => {
  it("counts the reltix example window correctly (Fri 20 Nov -> Tue 1 Dec)", () => {
    expect(businessDaysBetween("2026-11-20", "2026-12-01")).toBe(7);
    expect(addBusinessDays("2026-11-20", 10)).toBe("2026-12-04");
  });
  it("skips Christmas", () => {
    expect(addBusinessDays("2026-12-23", 2)).toBe("2026-12-28");
  });
});

describe("connector spec", () => {
  it("all shipped manifests are valid", async () => {
    const results = await loadManifestFiles();
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) expect(r.ok, JSON.stringify(r)).toBe(true);
  });
  it("rejects a broken manifest with readable errors", async () => {
    const [first] = await loadManifestFiles();
    if (!first?.ok) throw new Error("fixture");
    const v1 = validateManifest({ ...first.manifest, required_context: ["name", "iban"] });
    expect(v1.ok).toBe(false);
    if (!v1.ok) expect(v1.errors.some((e) => e.startsWith("required_context"))).toBe(true);
    const v2 = validateManifest({ ...first.manifest, offers: [first.manifest.offers[0], first.manifest.offers[0]] });
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.errors.some((e) => e.includes("duplicate offer"))).toBe(true);
  });
});

describe("offer computation", () => {
  it("fibre can't be live by move-in, so the bridge covers the gap", async () => {
    const [fibre] = (await loadManifestFiles()).filter((r) => r.ok && r.manifest.id === "example_fibre");
    if (!fibre?.ok) throw new Error("fixture");
    const { offer } = computeOffer(fibre.manifest, snapshot, "2026-11-20", "2026-12-01");
    expect(offer?.on_time).toBe(false);
    expect(offer?.start_date).toBe("2026-12-04");
    expect(offer?.bridge?.ready_by).toBe("2026-11-24");
  });
  it("is on time when ordered early enough", async () => {
    const [fibre] = (await loadManifestFiles()).filter((r) => r.ok && r.manifest.id === "example_fibre");
    if (!fibre?.ok) throw new Error("fixture");
    const { offer } = computeOffer(fibre.manifest, snapshot, "2026-11-02", "2026-12-01");
    expect(offer?.on_time).toBe(true);
    expect(offer?.start_date).toBe("2026-12-01");
    expect(offer?.bridge).toBeNull();
  });
  it("respects postcode eligibility", async () => {
    const [fibre] = (await loadManifestFiles()).filter((r) => r.ok && r.manifest.id === "example_fibre");
    if (!fibre?.ok) throw new Error("fixture");
    const res = computeOffer(fibre.manifest, { ...snapshot, property: { ...snapshot.property, postcode: "10115" } }, "2026-11-20", "2026-12-01");
    expect(res.offer).toBeNull();
    expect(res.ineligible[0]?.reasons).toContain("postcode not covered");
  });
});

describe("data minimisation", () => {
  it("shares only consented fields, never rent or owner", () => {
    const { payload, missing } = buildSharedPayload(snapshot, ["name", "address", "move_in_date"]);
    expect(Object.keys(payload).sort()).toEqual(["address", "move_in_date", "name"]);
    expect(JSON.stringify(payload)).not.toContain("Maria");
    expect(JSON.stringify(payload)).not.toContain("780");
    expect(missing).toEqual([]);
  });
  it("reports missing data instead of sending nulls", () => {
    const { missing } = buildSharedPayload({ ...snapshot, unit: { ...snapshot.unit, meters: [] } }, ["meter_number"]);
    expect(missing).toEqual(["meter_number"]);
  });
});

describe("webhook signature", () => {
  const body = JSON.stringify({ a: 1 });
  it("accepts a valid signature", () => expect(verify("s", body, sign("s", body))).toBe(true));
  it("rejects wrong secret, tampered body, missing header, expired timestamp", () => {
    expect(verify("x", body, sign("s", body))).toBe(false);
    expect(verify("s", body + " ", sign("s", body))).toBe(false);
    expect(verify("s", body, null)).toBe(false);
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(verify("s", body, sign("s", body, old))).toBe(false);
  });
});

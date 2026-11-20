import fs from "node:fs/promises"
import path from "node:path"

import { eq, inArray } from "drizzle-orm"

import type { DB, Exec } from "@/lib/db"
import { partnerOffers, partners } from "@/lib/db/schema"
import { centsToEur } from "@/lib/money"

import { ManifestSchema, type Manifest } from "./spec"

/** A partner as the engine sees it: its row id, its manifest and the row ids of its offers. */
export type RegisteredPartner = {
  /** partners.id (uuid) */
  partnerId: string
  /** manifest id, e.g. "example_fibre" (partners.slug) */
  slug: string
  manifest: Manifest
  /** manifest offer id -> partner_offers.id */
  offerIds: Record<string, string>
}

export type ManifestLoadResult =
  | { ok: true; file: string; manifest: Manifest }
  | { ok: false; file: string; errors: string[] }

export function formatZodIssues(
  issues: { path: PropertyKey[]; message: string }[]
): string[] {
  return issues.map(
    (i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`
  )
}

export function validateManifest(
  raw: unknown
): { ok: true; manifest: Manifest } | { ok: false; errors: string[] } {
  const parsed = ManifestSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, errors: formatZodIssues(parsed.error.issues) }
  return { ok: true, manifest: parsed.data }
}

/**
 * Reads every manifest in data/partners. Invalid files are reported, never silently skipped.
 * Paths stay literal (data/partners/...) so the bundler only traces that folder.
 */
export async function loadManifestFiles(): Promise<ManifestLoadResult[]> {
  const files = (await fs.readdir(path.join(process.cwd(), "data", "partners")))
    .filter((f) => f.endsWith(".json"))
    .sort()
  const results: ManifestLoadResult[] = []
  for (const file of files) {
    let raw: unknown
    try {
      raw = JSON.parse(
        await fs.readFile(
          path.join(process.cwd(), "data", "partners", file),
          "utf8"
        )
      )
    } catch (e) {
      results.push({
        ok: false,
        file,
        errors: [`invalid JSON: ${(e as Error).message}`],
      })
      continue
    }
    const v = validateManifest(raw)
    results.push(
      v.ok
        ? { ok: true, file, manifest: v.manifest }
        : { ok: false, file, errors: v.errors }
    )
  }
  return results
}

/**
 * Upserts a validated manifest and its offers, keyed by the manifest id (slug) and
 * the offer id within it. This is the whole "plug in a partner" step.
 */
export async function registerPartner(
  db: DB,
  manifest: Manifest
): Promise<string> {
  return db.transaction(async (tx) => {
    const regions = [
      ...new Set(
        manifest.offers.flatMap((o) => o.eligibility.postcode_prefixes)
      ),
    ]
    const values = {
      slug: manifest.id,
      name: manifest.name,
      category: manifest.category,
      regions,
      channels: [manifest.order.channel],
      manifest,
    }
    const [row] = await tx
      .insert(partners)
      .values(values)
      .onConflictDoUpdate({ target: partners.slug, set: values })
      .returning({ id: partners.id })
    const partnerId = row!.id
    for (const o of manifest.offers) {
      const offer = {
        partnerId,
        key: o.id,
        product: o.product,
        monthlyPriceEur: centsToEur(o.monthly_price_cents),
        leadTimeBusinessDays: o.lead_time_business_days,
        eligibility: o.eligibility,
      }
      await tx
        .insert(partnerOffers)
        .values(offer)
        .onConflictDoUpdate({
          target: [partnerOffers.partnerId, partnerOffers.key],
          set: offer,
        })
    }
    return partnerId
  })
}

async function hydrate(
  db: Exec,
  rows: (typeof partners.$inferSelect)[]
): Promise<RegisteredPartner[]> {
  if (rows.length === 0) return []
  const offers = await db
    .select({
      id: partnerOffers.id,
      partnerId: partnerOffers.partnerId,
      key: partnerOffers.key,
    })
    .from(partnerOffers)
    .where(
      inArray(
        partnerOffers.partnerId,
        rows.map((r) => r.id)
      )
    )
  // Stored manifests were validated on the way in; re-parse anyway so a bad row can't crash the engine.
  return rows.flatMap((r) => {
    const v = ManifestSchema.safeParse(r.manifest)
    if (!v.success) return []
    const offerIds = Object.fromEntries(
      offers.filter((o) => o.partnerId === r.id).map((o) => [o.key, o.id])
    )
    return [{ partnerId: r.id, slug: r.slug, manifest: v.data, offerIds }]
  })
}

export async function listPartners(db: Exec): Promise<RegisteredPartner[]> {
  return hydrate(db, await db.select().from(partners).orderBy(partners.slug))
}

export async function getPartnerBySlug(
  db: Exec,
  slug: string
): Promise<RegisteredPartner | null> {
  const rows = await db.select().from(partners).where(eq(partners.slug, slug))
  return (await hydrate(db, rows))[0] ?? null
}

export async function getPartnerById(
  db: Exec,
  partnerId: string
): Promise<RegisteredPartner | null> {
  const rows = await db
    .select()
    .from(partners)
    .where(eq(partners.id, partnerId))
  return (await hydrate(db, rows))[0] ?? null
}

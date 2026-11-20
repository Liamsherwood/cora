import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { DB, Exec } from "@/db/client";
import { partnerOffers, partners } from "@/db/schema";
import { ManifestSchema, type Manifest } from "./spec";

const PARTNER_DIR = path.join(process.cwd(), "data", "partners");

export type ManifestLoadResult =
  | { ok: true; file: string; manifest: Manifest }
  | { ok: false; file: string; errors: string[] };

export function formatZodIssues(issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`);
}

export function validateManifest(raw: unknown): { ok: true; manifest: Manifest } | { ok: false; errors: string[] } {
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error.issues) };
  return { ok: true, manifest: parsed.data };
}

/** Reads every manifest in data/partners. Invalid files are reported, never silently skipped. */
export async function loadManifestFiles(dir = PARTNER_DIR): Promise<ManifestLoadResult[]> {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const results: ManifestLoadResult[] = [];
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
    } catch (e) {
      results.push({ ok: false, file, errors: [`invalid JSON: ${(e as Error).message}`] });
      continue;
    }
    const v = validateManifest(raw);
    results.push(v.ok ? { ok: true, file, manifest: v.manifest } : { ok: false, file, errors: v.errors });
  }
  return results;
}

/** Upserts a validated manifest and its offers. This is the whole "plug in a partner" step. */
export async function registerPartner(db: DB, manifest: Manifest): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(partners)
      .values({ id: manifest.id, name: manifest.name, category: manifest.category, manifest })
      .onConflictDoUpdate({
        target: partners.id,
        set: { name: manifest.name, category: manifest.category, manifest },
      });
    for (const o of manifest.offers) {
      const values = {
        id: `${manifest.id}__${o.id}`,
        partnerId: manifest.id,
        product: o.product,
        monthlyPriceCents: o.monthly_price_cents,
        leadTimeBusinessDays: o.lead_time_business_days,
        eligibility: o.eligibility,
      };
      await tx.insert(partnerOffers).values(values).onConflictDoUpdate({ target: partnerOffers.id, set: values });
    }
  });
}

export async function listManifests(db: Exec): Promise<Manifest[]> {
  const rows = await db.select().from(partners);
  // Stored manifests were validated on the way in; re-parse anyway so a bad row can't crash the engine.
  return rows.flatMap((r) => {
    const v = ManifestSchema.safeParse(r.manifest);
    return v.success ? [v.data] : [];
  });
}

export async function getManifest(db: Exec, partnerId: string): Promise<Manifest | null> {
  const [row] = await db.select().from(partners).where(eq(partners.id, partnerId));
  if (!row) return null;
  const v = ManifestSchema.safeParse(row.manifest);
  return v.success ? v.data : null;
}

import { z } from "zod";
import { demoOnly, handle, parseBody } from "@/lib/api";
import { listManifests, registerPartner, validateManifest } from "@/connectors/registry";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle((db) => listManifests(db));
}

/** Plug in a partner: validate the manifest against the connector spec, then register it. */
export async function POST(req: Request) {
  return handle(async (db) => {
    demoOnly();
    const { manifest } = await parseBody(req, z.object({ manifest: z.unknown() }).strict());
    const v = validateManifest(manifest);
    if (!v.ok) throw new AppError("manifest does not satisfy connector spec v1", 422, "invalid_manifest", v.errors);
    await registerPartner(db, v.manifest);
    return { ok: true, partner_id: v.manifest.id, offers: v.manifest.offers.length };
  }, 201);
}

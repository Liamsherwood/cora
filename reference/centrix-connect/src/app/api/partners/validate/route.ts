import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { validateManifest } from "@/connectors/registry";

export const dynamic = "force-dynamic";

/** Dry run for partners: does my manifest satisfy the spec? Nothing is stored. */
export async function POST(req: Request) {
  return handle(async () => {
    const { manifest } = await parseBody(req, z.object({ manifest: z.unknown() }).strict());
    const v = validateManifest(manifest);
    return v.ok ? { valid: true, partner_id: v.manifest.id } : { valid: false, errors: v.errors };
  });
}

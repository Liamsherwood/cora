import type { DB } from "@/db/client";
import { StatusUpdateSchema } from "@/connectors/spec";
import { getManifest } from "@/connectors/registry";
import { AppError, unauthorized } from "@/lib/errors";
import { applyPartnerStatus } from "@/workflow/engine";
import { partnerSecret, verify } from "./signature";

/** Shared by the public webhook route and the demo partner simulator. Verifies BEFORE parsing. */
export async function handlePartnerWebhook(db: DB, partnerId: string, rawBody: string, signatureHeader: string | null) {
  const manifest = await getManifest(db, partnerId);
  if (!manifest) throw new AppError("unknown partner", 404, "not_found");
  if (!verify(partnerSecret(partnerId), rawBody, signatureHeader)) throw unauthorized();

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    throw new AppError("body must be valid JSON", 400, "bad_request");
  }
  const parsed = StatusUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("invalid status update", 400, "bad_request", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return applyPartnerStatus(db, partnerId, parsed.data);
}

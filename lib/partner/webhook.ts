import type { DB } from "@/lib/db"
import { getPartnerBySlug } from "@/lib/connectors/registry"
import { StatusUpdateSchema } from "@/lib/connectors/spec"
import { AppError, unauthorized } from "@/lib/errors"
import { applyPartnerStatus } from "@/lib/workflow/engine"

import { partnerSecret, verify } from "./signature"

/**
 * Shared by the public webhook route and the demo partner simulator. Verifies the
 * signature BEFORE parsing the body. `partnerSlug` is the manifest id from the URL.
 */
export async function handlePartnerWebhook(
  db: DB,
  partnerSlug: string,
  rawBody: string,
  signatureHeader: string | null
) {
  const partner = await getPartnerBySlug(db, partnerSlug)
  if (!partner) throw new AppError("unknown partner", 404, "not_found")
  if (!verify(partnerSecret(partner.slug), rawBody, signatureHeader))
    throw unauthorized()

  let raw: unknown
  try {
    raw = JSON.parse(rawBody)
  } catch {
    throw new AppError("body must be valid JSON", 400, "bad_request")
  }
  const parsed = StatusUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError(
      "invalid status update",
      400,
      "bad_request",
      parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }))
    )
  }
  return applyPartnerStatus(db, partner.slug, parsed.data)
}

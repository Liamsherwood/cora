import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Partner webhooks are signed: X-Centrix-Signature: t=<unix seconds>,v1=<hex hmac>
 * where hmac = HMAC-SHA256(secret, `${t}.${rawBody}`). The timestamp blocks replays
 * of old captured requests; event_id idempotency blocks replays inside the window.
 */
export const SIGNATURE_HEADER = "x-centrix-signature"
const TOLERANCE_SECONDS = 300

/**
 * The webhook secret of one partner (by manifest id). Every partner has its own secret,
 * so a partner can never produce a valid signature for another partner's webhook:
 *
 * - PARTNER_SECRET_<SLUG> (e.g. PARTNER_SECRET_EXAMPLE_FIBRE) if set, else
 * - derived from the master key PARTNER_WEBHOOK_SECRET as
 *   HMAC-SHA256(master, "partner-webhook:<slug>"). The master key never leaves centrix;
 *   each partner is handed only its derived secret (see `npm run partner:secret`).
 */
export function partnerSecret(slug: string): string {
  const specific = process.env[`PARTNER_SECRET_${slug.toUpperCase()}`]
  if (specific) return specific
  const master = process.env.PARTNER_WEBHOOK_SECRET
  if (!master)
    throw new Error(
      `No webhook secret for partner "${slug}": set PARTNER_SECRET_${slug.toUpperCase()} or PARTNER_WEBHOOK_SECRET`
    )
  return createHmac("sha256", master)
    .update(`partner-webhook:${slug}`)
    .digest("hex")
}

export function sign(
  secret: string,
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000)
): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")
  return `t=${timestamp},v1=${mac}`
}

export function verify(
  secret: string,
  rawBody: string,
  header: string | null,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=")
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
    })
  )
  const ts = Number(parts.t)
  const given = parts.v1
  if (!Number.isFinite(ts) || !given || !/^[0-9a-f]{64}$/.test(given))
    return false
  if (Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false
  const expected = createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest()
  const givenBuf = Buffer.from(given, "hex")
  return (
    givenBuf.length === expected.length && timingSafeEqual(givenBuf, expected)
  )
}

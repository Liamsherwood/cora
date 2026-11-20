import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Partner webhooks are signed: X-Centrix-Signature: t=<unix seconds>,v1=<hex hmac>
 * where hmac = HMAC-SHA256(secret, `${t}.${rawBody}`). The timestamp blocks replays
 * of old captured requests; event_id idempotency blocks replays inside the window.
 */
export const SIGNATURE_HEADER = "x-centrix-signature"
const TOLERANCE_SECONDS = 300

export function partnerSecret(partnerId: string): string {
  // Per-partner secret if configured (PARTNER_SECRET_EXAMPLE_FIBRE), else the shared demo secret.
  const specific = process.env[`PARTNER_SECRET_${partnerId.toUpperCase()}`]
  const secret = specific || process.env.PARTNER_WEBHOOK_SECRET
  if (!secret) throw new Error("PARTNER_WEBHOOK_SECRET is not configured")
  return secret
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

import { createHmac, timingSafeEqual } from "node:crypto"

import { AppError } from "@/lib/errors"

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * ElevenLabs server tools and the inbound-call webhook send the shared secret in the
 * `x-tool-secret` header (configured as a workspace secret in ElevenLabs).
 */
export function requireToolSecret(req: Request): void {
  const expected = process.env.VOICE_TOOL_SECRET
  const given = req.headers.get("x-tool-secret")
  if (!expected || !given || !same(given, expected))
    throw new AppError("invalid tool secret", 401, "unauthorized")
}

/**
 * ElevenLabs post-call webhooks are signed: header `ElevenLabs-Signature: t=<unix>,v0=<hex>`
 * where hex = HMAC-SHA256(secret, `${t}.${rawBody}`). Rejects stale signatures (30 min).
 */
export function verifyElevenLabsSignature(
  header: string | null,
  rawBody: string,
  secret: string | undefined,
  nowMs = Date.now()
): void {
  if (!secret)
    throw new AppError("webhook secret not configured", 503, "unconfigured")
  const parts = Object.fromEntries(
    (header ?? "")
      .split(",")
      .map((p) => p.trim().split("=", 2) as [string, string])
  )
  const t = Number(parts.t)
  if (!parts.v0 || !Number.isFinite(t))
    throw new AppError("missing signature", 401, "unauthorized")
  if (Math.abs(nowMs / 1000 - t) > 30 * 60)
    throw new AppError("stale signature", 401, "unauthorized")
  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex")
  if (!same(parts.v0, expected))
    throw new AppError("invalid signature", 401, "unauthorized")
}

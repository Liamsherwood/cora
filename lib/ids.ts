import { createHash } from "node:crypto"

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Ids are UUIDs everywhere. Check before querying so a bad id is a 404, not a Postgres error. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v)
}

export { randomUUID as newId } from "node:crypto"

export const caseRef = (id: string) => `C-${id.slice(0, 6).toUpperCase()}`
export const ticketRef = (id: string) => `T-${id.slice(0, 6).toUpperCase()}`

/**
 * Deterministic, name-based UUID (SHA-256, version 8 layout): the same name always gives
 * the same id. Used for event ids, so firing the same moment twice is one event.
 */
export function nameUuid(name: string): string {
  const b = createHash("sha256").update(name).digest().subarray(0, 16)
  b[6] = (b[6]! & 0x0f) | 0x80 // version 8 (custom)
  b[8] = (b[8]! & 0x3f) | 0x80 // RFC 4122 variant
  const hex = b.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

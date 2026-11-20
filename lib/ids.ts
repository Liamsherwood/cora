const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Ids are UUIDs everywhere. Check before querying so a bad id is a 404, not a Postgres error. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v)
}

export { randomUUID as newId } from "node:crypto"

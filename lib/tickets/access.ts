import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

export function isStaffTicketInbox() {
  return (
    process.env.DEMO_MODE !== "true" &&
    Boolean(process.env.TICKETING_STAFF_PASSWORD)
  )
}

export function hasTicketAccess(authorization: string | null) {
  const password = process.env.TICKETING_STAFF_PASSWORD
  const credential = authorization?.match(/^Basic (\S+)$/i)?.[1]
  if (!isStaffTicketInbox() || !password || !credential) return false

  const expected = Buffer.from(`staff:${password}`).toString("base64")
  const providedHash = createHash("sha256").update(credential).digest()
  const expectedHash = createHash("sha256").update(expected).digest()
  return timingSafeEqual(providedHash, expectedHash)
}

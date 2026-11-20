import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { requireToolSecret } from "@/lib/voice/auth"
import { findCase, getCaller, openCases } from "@/lib/voice/caller"

const Body = z
  .object({
    party_id: z.uuid(),
    /** A case reference like "C-1A2B3C" to ask about one case; omit for all open cases. */
    reference: z.string().max(20).optional(),
  })
  .strict()

/** Server tool `get_cases`: the caller's open cases, or one case by its reference. */
export async function POST(req: Request) {
  return handle(async (db) => {
    requireToolSecret(req)
    const b = await parseBody(req, Body)
    const caller = await getCaller(db, b.party_id)
    if (b.reference) return { case: await findCase(db, caller, b.reference) }
    const cases = await openCases(db, caller)
    return { count: cases.length, cases: cases.slice(0, 10) }
  })
}

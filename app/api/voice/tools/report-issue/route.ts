import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { requireToolSecret } from "@/lib/voice/auth"
import {
  CASE_CATEGORIES,
  CASE_PRIORITIES,
  getCaller,
  reportIssue,
} from "@/lib/voice/caller"

const Body = z
  .object({
    party_id: z.uuid(),
    /** Defaults to the caller's main home. */
    unit_id: z.uuid().optional(),
    category: z.enum(CASE_CATEGORIES),
    priority: z.enum(CASE_PRIORITIES),
    /** "common" for stairwell, lift, basement, courtyard, roof, front door. */
    scope: z.enum(["unit", "common"]).default("unit"),
    /** What the caller said, in their words and language. */
    description: z.string().min(5).max(1000),
    /** One English sentence for the property manager. */
    summary: z.string().min(5).max(300),
    /** {{system__conversation_id}}, to find the recording later. */
    conversation_id: z.string().max(100).optional(),
  })
  .strict()

/** Server tool `report_issue`: files a repair case for the caller. */
export async function POST(req: Request) {
  return handle(async (db) => {
    requireToolSecret(req)
    const b = await parseBody(req, Body)
    const caller = await getCaller(db, b.party_id)
    return { ok: true, ...(await reportIssue(db, caller, b)) }
  }, 201)
}

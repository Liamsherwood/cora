import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { requireToolSecret } from "@/lib/voice/auth"
import {
  findCallerByNameAndStreet,
  findCallerByPhone,
  supportContext,
} from "@/lib/voice/caller"

const Body = z
  .object({
    /** {{system__caller_id}} when the call came in by phone. */
    phone: z.string().max(40).optional(),
    full_name: z.string().max(120).optional(),
    street: z.string().max(120).optional(),
  })
  .strict()

/**
 * Server tool `identify_caller`. Used when the call started without context (web widget,
 * withheld number): the agent asks for the full name and the street, and only an exact
 * match with a current home there identifies the caller.
 */
export async function POST(req: Request) {
  return handle(async (db) => {
    requireToolSecret(req)
    const b = await parseBody(req, Body)
    const byPhone = b.phone ? await findCallerByPhone(db, b.phone) : null
    const caller =
      byPhone ??
      (b.full_name && b.street
        ? await findCallerByNameAndStreet(db, b.full_name, b.street)
        : null)
    const vars = await supportContext(db, caller)
    if (vars.caller_known !== "yes")
      return {
        found: false,
        say: "I couldn't find you with that. Could you give me your full name and the street of your flat exactly as on your lease?",
      }
    return { found: true, ...vars }
  })
}

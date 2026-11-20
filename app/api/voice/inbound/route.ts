import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { requireToolSecret } from "@/lib/voice/auth"
import { findCallerByPhone, supportContext } from "@/lib/voice/caller"
import { greeting } from "@/lib/voice/greetings"

const Body = z.object({
  caller_id: z.string().optional(),
  agent_id: z.string().optional(),
  called_number: z.string().optional(),
  call_sid: z.string().optional(),
})

/**
 * ElevenLabs "conversation initiation client data" webhook for inbound phone calls.
 * ElevenLabs calls it when the phone rings; we recognise the caller by number and hand
 * the agent its context (name, flat, open cases, last call) plus a greeting and voice
 * language for that person. Unknown numbers get a neutral bilingual greeting.
 */
export async function POST(req: Request) {
  return handle(async (db) => {
    requireToolSecret(req)
    const b = await parseBody(req, Body)
    const caller = b.caller_id ? await findCallerByPhone(db, b.caller_id) : null
    const vars = await supportContext(db, caller)
    const known = vars.caller_known === "yes"
    return {
      type: "conversation_initiation_client_data",
      dynamic_variables: vars,
      conversation_config_override: {
        agent: {
          language: known ? vars.caller_language : "de",
          first_message: greeting(
            vars.caller_language,
            known ? vars.caller_first_name : null
          ),
        },
      },
    }
  })
}

import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { finishTicketIntake, voiceIntakeId } from "@/lib/tickets/activity"
import { ticketClassification } from "@/lib/tickets/classification"
import { requireToolSecret } from "@/lib/voice/auth"
import { getCaller, reportIssue } from "@/lib/voice/caller"

const Body = z
  .object({
    party_id: z.uuid(),
    /** Defaults to the caller's main home. */
    unit_id: z.uuid().optional(),
    ...ticketClassification.shape,
    /** "common" for stairwell, lift, basement, courtyard, roof, front door. */
    scope: ticketClassification.shape.scope.default("unit"),
    /** What the caller said, in their words and language. */
    description: z.string().trim().min(5).max(1000),
    /** One English sentence for the property manager. */
    summary: z.string().trim().min(5).max(300),
    /** {{system__conversation_id}}, to find the recording later. */
    conversation_id: z.string().min(1).max(100).optional(),
  })
  .strict()

/** Server tool `report_issue`: files a classified ticket and case for the caller. */
export async function POST(req: Request) {
  return handle(async (db) => {
    requireToolSecret(req)
    const b = await parseBody(req, Body)
    try {
      const caller = await getCaller(db, b.party_id)
      return { ok: true, ...(await reportIssue(db, caller, b)) }
    } finally {
      if (b.conversation_id) {
        await finishTicketIntake(db, voiceIntakeId(b.conversation_id)).catch(
          () => {
            console.error("Voice ticket activity cleanup failed")
          }
        )
      }
    }
  }, 201)
}

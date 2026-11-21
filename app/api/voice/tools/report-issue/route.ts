import { handle, parseBody } from "@/lib/api"
import { finishTicketIntake, voiceIntakeId } from "@/lib/tickets/activity"
import { requireToolSecret } from "@/lib/voice/auth"
import { getCaller, reportIssue } from "@/lib/voice/caller"
import { fileTicketInput } from "@/lib/voice/tools"

/** Server tool `file_maintenance_ticket`: files a classified ticket and case for the caller. */
export async function POST(req: Request) {
  return handle(async (db) => {
    requireToolSecret(req)
    const b = await parseBody(req, fileTicketInput)
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

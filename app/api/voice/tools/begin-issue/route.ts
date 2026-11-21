import { z } from "zod"

import { handle, parseBody } from "@/lib/api"
import { startTicketIntake, voiceIntakeId } from "@/lib/tickets/activity"
import { requireToolSecret } from "@/lib/voice/auth"

const Body = z.object({ conversation_id: z.string().min(1).max(100) }).strict()

export async function POST(req: Request) {
  return handle(async (db) => {
    requireToolSecret(req)
    const { conversation_id } = await parseBody(req, Body)
    await startTicketIntake(db, null, voiceIntakeId(conversation_id))
    return { ok: true }
  })
}

import "server-only"

import { and, eq, gt, isNull, lte, sql } from "drizzle-orm"

import type { DB, Exec } from "@/lib/db"
import { maintenanceTickets, ticketIntakes } from "@/lib/db/schema/tickets"
import { nameUuid } from "@/lib/ids"

export function voiceIntakeId(conversationId: string) {
  return nameUuid(`elevenlabs-intake:${conversationId}`)
}

export function startTicketIntake(
  db: DB,
  threadKey: string | null,
  id?: string
) {
  return db.transaction(async (tx) => {
    await tx
      .delete(ticketIntakes)
      .where(lte(ticketIntakes.expiresAt, sql`now()`))

    const openTicket = threadKey
      ? tx
          .select({ id: maintenanceTickets.id })
          .from(maintenanceTickets)
          .where(
            and(
              eq(maintenanceTickets.threadKey, threadKey),
              isNull(maintenanceTickets.resolvedAt)
            )
          )
      : null
    const [intake] = await tx
      .insert(ticketIntakes)
      .values({ id, ticketId: openTicket ? sql`(${openTicket})` : null })
      .onConflictDoUpdate({
        target: ticketIntakes.id,
        set: { expiresAt: sql`now() + interval '60 seconds'` },
      })
      .returning({ id: ticketIntakes.id })
    return intake.id
  })
}

export async function finishTicketIntake(db: Exec, id: string) {
  await db.delete(ticketIntakes).where(eq(ticketIntakes.id, id))
}

export function listTicketActivity(db: Exec) {
  return db
    .select({
      ticketId: ticketIntakes.ticketId,
      sendingReply: sql<boolean>`bool_and(${ticketIntakes.sendingReply})`,
    })
    .from(ticketIntakes)
    .where(gt(ticketIntakes.expiresAt, sql`now()`))
    .groupBy(ticketIntakes.ticketId)
}

"use server"

import { refresh } from "next/cache"

import { getDb } from "@/lib/db"
import {
  commissionContractor,
  findContractors,
  type ContractorSearch,
} from "@/lib/contractors/match"
import { AppError } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { resolveTicket } from "@/lib/tickets/repository"
import { clock } from "@/lib/time"

/*
 * Like the other demo screens' actions these have no auth yet (see CONTEXT.md, open
 * points): production puts the inbox behind the property manager's login. Every input
 * is checked again on the server; the client only names the ticket and the contractor.
 * Visits are planned on the real clock: tickets are stamped with it, not DEMO_NOW.
 */

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: string }

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message }
    console.error("[tickets action] unhandled error", e)
    return { ok: false, error: "Something went wrong on our side." }
  }
}

export async function resolveTicketAction(formData: FormData) {
  const ticketId = formData.get("ticketId")
  if (!isUuid(ticketId)) throw new Error("Invalid ticket")
  await resolveTicket(getDb(), ticketId)
  refresh()
}

export async function findContractorsAction(
  ticketId: string
): Promise<ActionResult<ContractorSearch>> {
  return run(() => findContractors(getDb(), ticketId, clock()))
}

export async function commissionContractorAction(
  ticketId: string,
  contractorId: string
): Promise<
  ActionResult<{ contractorName: string; scheduledAt: string | null }>
> {
  // No refresh here: the finder shows the confirmation first, then refreshes the page.
  return run(async () => {
    const booked = await commissionContractor(
      getDb(),
      ticketId,
      contractorId,
      clock()
    )
    return {
      contractorName: booked.contractorName,
      scheduledAt: booked.scheduledAt?.toISOString() ?? null,
    }
  })
}

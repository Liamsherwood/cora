"use server"

import { refresh } from "next/cache"

import { getDb } from "@/lib/db"
import { isUuid } from "@/lib/ids"
import { resolveTicket } from "@/lib/tickets/repository"

/*
 * Like the other demo screens' actions this has no auth yet (see CONTEXT.md, open
 * points): production puts the inbox behind the property manager's login.
 */
export async function resolveTicketAction(formData: FormData) {
  const ticketId = formData.get("ticketId")
  if (!isUuid(ticketId)) throw new Error("Invalid ticket")
  await resolveTicket(getDb(), ticketId)
  refresh()
}

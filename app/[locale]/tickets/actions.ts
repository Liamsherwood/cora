"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { getDb } from "@/lib/db"
import { isUuid } from "@/lib/ids"
import { isLocale } from "@/lib/i18n/locales"
import { hasTicketAccess } from "@/lib/tickets/access"
import { linkTicketToTenancy, resolveTicket } from "@/lib/tickets/repository"

async function requireTicketAccess() {
  if (!hasTicketAccess((await headers()).get("authorization"))) {
    throw new Error("Unauthorized")
  }
}

export async function markTicketResolved(formData: FormData) {
  await requireTicketAccess()
  const ticketId = formData.get("ticketId")
  if (!isUuid(ticketId)) throw new Error("Invalid ticket")

  await resolveTicket(getDb(), ticketId)
  revalidatePath("/[locale]/tickets", "page")
}

export async function assignTicketTenancy(formData: FormData) {
  await requireTicketAccess()
  const ticketId = formData.get("ticketId")
  const locale = formData.get("locale")
  const tenancy = formData.get("tenancy")
  if (!isUuid(ticketId) || typeof locale !== "string" || !isLocale(locale)) {
    throw new Error("Invalid ticket")
  }

  const [partyId, unitId, extra] =
    typeof tenancy === "string" ? tenancy.split(":") : []
  const linked =
    extra === undefined &&
    isUuid(partyId) &&
    isUuid(unitId) &&
    (await linkTicketToTenancy(getDb(), ticketId, partyId, unitId))
  revalidatePath("/[locale]/tickets", "page")

  const query = new URLSearchParams({ ticket: ticketId })
  if (!linked) query.set("assignment", "unavailable")
  redirect(`/${locale}/tickets?${query}#ticket-detail`)
}

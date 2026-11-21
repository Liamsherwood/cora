import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm"

import type { DB, Exec } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { AppError, notFound } from "@/lib/errors"
import { caseRef, isUuid, nameUuid, newId } from "@/lib/ids"
import type { TicketClassification } from "@/lib/tickets/classification"
import { ticketTitle } from "@/lib/tickets/details"
import { saveTicketRun } from "@/lib/tickets/repository"
import { addDays, clock, now, toDay } from "@/lib/time"

/**
 * The voice agent's view of centrix. Everything the ElevenLabs agent knows or does
 * goes through these functions (called by the routes under /api/voice): who is calling,
 * which flat they live in or own, their open cases, and filing a new case. The agent
 * never sees rent, owner data or other residents.
 */

const CLOSED = ["resolved", "closed", "cancelled"]
export const VOICE_LANGUAGES = [
  "de",
  "en",
  "tr",
  "pl",
  "uk",
  "ar",
  "nl",
] as const

/** Digits only, with the country code: "+49 172 853 7122", "0049…", "0172…" -> "491728537122". */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, "")
  if (d.startsWith("00")) d = d.slice(2)
  else if (d.startsWith("0")) d = `49${d.slice(1)}` // German national format
  return d
}

type Home = {
  unit_id: string
  property_id: string
  address: string
  unit_label: string
  role: "tenant" | "owner"
  /** Set when the lease starts in the future (moving in). */
  move_in: string | null
}

export type Caller = {
  party_id: string
  name: string
  first_name: string
  language: string
  homes: Home[]
}

async function homesOf(db: Exec, partyId: string): Promise<Home[]> {
  const today = toDay(now())
  const soon = addDays(today, 90)
  const leases = await db
    .select({
      unitId: t.units.id,
      propertyId: t.units.propertyId,
      identifier: t.units.identifier,
      address: t.properties.address,
      start: t.leases.startDate,
    })
    .from(t.leaseParties)
    .innerJoin(t.leases, eq(t.leaseParties.leaseId, t.leases.id))
    .innerJoin(t.units, eq(t.leases.unitId, t.units.id))
    .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
    .where(
      and(
        eq(t.leaseParties.partyId, partyId),
        inArray(t.leaseParties.role, ["tenant", "co_tenant"]),
        lte(t.leases.startDate, soon),
        or(isNull(t.leases.endDate), gte(t.leases.endDate, today))
      )
    )
    .orderBy(t.leases.startDate)
  const owned = await db
    .select({
      unitId: t.units.id,
      propertyId: t.units.propertyId,
      identifier: t.units.identifier,
      address: t.properties.address,
    })
    .from(t.ownerships)
    .innerJoin(t.units, eq(t.ownerships.unitId, t.units.id))
    .innerJoin(t.properties, eq(t.units.propertyId, t.properties.id))
    .where(
      and(
        eq(t.ownerships.partyId, partyId),
        lte(t.ownerships.validFrom, today),
        or(isNull(t.ownerships.validTo), gte(t.ownerships.validTo, today))
      )
    )
  const homes: Home[] = [
    ...leases.map((l) => ({
      unit_id: l.unitId,
      property_id: l.propertyId,
      address: l.address,
      unit_label: l.identifier,
      role: "tenant" as const,
      move_in: l.start > today ? l.start : null,
    })),
    ...owned.map((o) => ({
      unit_id: o.unitId,
      property_id: o.propertyId,
      address: o.address,
      unit_label: o.identifier,
      role: "owner" as const,
      move_in: null,
    })),
  ]
  // Current homes first, then upcoming move-ins; parking spaces last.
  return homes.sort(
    (a, b) =>
      Number(a.unit_label.startsWith("TG")) -
        Number(b.unit_label.startsWith("TG")) ||
      Number(a.move_in !== null) - Number(b.move_in !== null)
  )
}

async function toCaller(
  db: Exec,
  p: typeof t.parties.$inferSelect
): Promise<Caller> {
  return {
    party_id: p.id,
    name: p.name,
    first_name: p.name.split(" ")[0] ?? p.name,
    language: p.language ?? "de",
    homes: await homesOf(db, p.id),
  }
}

/** Caller ID -> the person and their homes. Only people, never organisations. */
export async function findCallerByPhone(
  db: Exec,
  phone: string
): Promise<Caller | null> {
  const digits = phoneDigits(phone)
  if (digits.length < 8) return null
  const rows = await db
    .select()
    .from(t.parties)
    .where(
      and(
        eq(t.parties.type, "person"),
        sql`regexp_replace(${t.parties.phone}, '[^0-9]', '', 'g') = ${digits}`
      )
    )
    .limit(2)
  // A number shared by two people can't identify anyone.
  if (rows.length !== 1) return null
  return toCaller(db, rows[0]!)
}

/**
 * No caller ID (web widget, withheld number): identify by full name plus the street
 * they live on. Both must match exactly one person with a current home there.
 */
export async function findCallerByNameAndStreet(
  db: Exec,
  name: string,
  street: string
): Promise<Caller | null> {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/str(\.|asse)?\b/g, "strasse")
      .replace(/[^a-z0-9]/g, "")
  const wanted = norm(name)
  const streetKey = norm(street)
  if (wanted.length < 4 || streetKey.length < 4) return null
  const people = await db
    .select()
    .from(t.parties)
    .where(
      and(
        eq(t.parties.type, "person"),
        sql`lower(${t.parties.name}) like ${`%${name.trim().split(/\s+/).pop()!.toLowerCase()}%`}`
      )
    )
  const matches: Caller[] = []
  for (const p of people) {
    if (norm(p.name) !== wanted) continue
    const c = await toCaller(db, p)
    if (c.homes.some((h) => norm(h.address).includes(streetKey)))
      matches.push(c)
  }
  return matches.length === 1 ? matches[0]! : null
}

export async function getCaller(db: Exec, partyId: string): Promise<Caller> {
  if (!isUuid(partyId)) throw notFound("caller")
  const [p] = await db.select().from(t.parties).where(eq(t.parties.id, partyId))
  if (!p) throw notFound("caller")
  return toCaller(db, p)
}

type CaseView = {
  reference: string
  case_id: string
  category: string
  priority: string
  status: string
  where: string
  summary: string
  description: string
  next_visit: string | null
  contractor: string | null
}

/** Open cases on the caller's homes (and common areas of their buildings) plus any they reported. */
export async function openCases(db: Exec, caller: Caller): Promise<CaseView[]> {
  const unitIds = caller.homes.map((h) => h.unit_id)
  const propertyIds = [...new Set(caller.homes.map((h) => h.property_id))]
  const scope = [
    eq(t.cases.reporterPartyId, caller.party_id),
    ...(unitIds.length ? [inArray(t.cases.unitId, unitIds)] : []),
    ...(propertyIds.length
      ? [and(isNull(t.cases.unitId), inArray(t.cases.propertyId, propertyIds))]
      : []),
  ]
  const rows = await db
    .select({
      id: t.cases.id,
      category: t.cases.category,
      priority: t.cases.priority,
      status: t.cases.status,
      unitLabel: t.units.identifier,
      address: t.properties.address,
    })
    .from(t.cases)
    .innerJoin(t.properties, eq(t.cases.propertyId, t.properties.id))
    .leftJoin(t.units, eq(t.cases.unitId, t.units.id))
    .where(and(notInArray(t.cases.status, CLOSED), or(...scope)))
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)

  const created = await db
    .select({ payload: t.events.payload, occurredAt: t.events.occurredAt })
    .from(t.events)
    .where(
      and(
        eq(t.events.type, "case.created"),
        inArray(sql<string>`${t.events.payload}->>'case_id'`, ids)
      )
    )
  const textOf = new Map<
    string,
    { summary: string; description: string; at: Date }
  >()
  for (const e of created) {
    const p = e.payload as Record<string, unknown>
    textOf.set(String(p.case_id), {
      // The short title reads better on the phone than the staff summary.
      summary: String(p.title ?? p.summary ?? ""),
      description: String(p.description ?? ""),
      at: e.occurredAt,
    })
  }
  const visits = await db
    .select({
      caseId: t.workOrders.caseId,
      at: t.workOrders.scheduledAt,
      status: t.workOrders.status,
      contractor: t.parties.name,
    })
    .from(t.workOrders)
    .innerJoin(t.parties, eq(t.workOrders.contractorId, t.parties.id))
    .where(
      and(
        inArray(t.workOrders.caseId, ids),
        notInArray(t.workOrders.status, ["cancelled"])
      )
    )
    .orderBy(desc(t.workOrders.scheduledAt))
  const visitOf = new Map<string, (typeof visits)[number]>()
  for (const v of visits) if (!visitOf.has(v.caseId)) visitOf.set(v.caseId, v)

  const reportedAt = (id: string) => textOf.get(id)?.at.getTime() ?? 0
  return [...rows]
    .sort((a, b) => reportedAt(b.id) - reportedAt(a.id))
    .map((r) => {
      const text = textOf.get(r.id)
      const v = visitOf.get(r.id)
      return {
        reference: caseRef(r.id),
        case_id: r.id,
        category: r.category,
        priority: r.priority,
        status: r.status,
        where: r.unitLabel
          ? `${r.address}, ${r.unitLabel}`
          : `${r.address}, common area`,
        summary: text?.summary ?? r.category,
        description: text?.description ?? "",
        next_visit: v?.at ? berlin(v.at) : null,
        contractor: v?.contractor ?? null,
      }
    })
}

/** "Sat 21 Nov, 09:00" in German local time, so the agent can read it out. */
function berlin(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export async function findCase(db: Exec, caller: Caller, reference: string) {
  const key = reference
    .replace(/[^0-9a-f]/gi, "")
    .toLowerCase()
    .slice(-6)
  if (key.length < 4)
    throw new AppError("reference too short", 400, "bad_request")
  const all = await openCases(db, caller)
  const hit = all.find((c) => c.case_id.startsWith(key))
  if (!hit) throw notFound(`case ${reference}`)
  return hit
}

export type NewIssue = TicketClassification & {
  unit_id?: string
  /** Short English inbox title, e.g. "Kitchen tap leaking". */
  title?: string
  description: string
  summary: string
  location?: string
  since?: string
  resident_actions?: string
  safety_advice?: string
  access?: string
  conversation_id?: string
}

/**
 * Files a case for the caller and records the `case.created` event, so it shows up for
 * the property manager and any partner subscribed to that trigger.
 */
export async function reportIssue(db: DB, caller: Caller, issue: NewIssue) {
  const home =
    (issue.unit_id && caller.homes.find((h) => h.unit_id === issue.unit_id)) ||
    (!issue.unit_id ? caller.homes[0] : undefined)
  if (!home)
    throw new AppError(
      "the caller has no home on file for that unit",
      403,
      "forbidden"
    )
  const classification = {
    category: issue.category,
    priority: issue.priority,
    scope: issue.scope,
  }
  const reportKey = issue.conversation_id
    ? nameUuid(
        JSON.stringify([
          "elevenlabs-report",
          issue.conversation_id,
          caller.party_id,
          home.unit_id,
          issue.scope,
          issue.description.trim().replace(/\s+/g, " ").toLowerCase(),
        ])
      )
    : newId()
  const title = ticketTitle(issue.title)
  const ticket = await saveTicketRun(db, {
    threadKey: reportKey,
    messageKey: reportKey,
    agent: "cora-voice",
    conversationId: issue.conversation_id,
    replyType: "generated",
    startedAt: clock(),
    report: {
      kind: "report",
      title,
      summary: issue.summary,
      classification,
      details: {
        description: issue.description,
        location: issue.location,
        since: issue.since,
        residentActions: issue.resident_actions,
        safetyAdvice: issue.safety_advice,
        access: issue.access,
        language: caller.language,
      },
    },
    createVoiceCase: async (tx) => {
      const caseId = newId()
      await tx.insert(t.cases).values({
        id: caseId,
        propertyId: home.property_id,
        unitId: issue.scope === "common" ? null : home.unit_id,
        reporterPartyId: caller.party_id,
        category: issue.category,
        priority: issue.priority,
        status: "open",
      })
      await tx.insert(t.events).values({
        id: newId(),
        type: "case.created",
        unitId: home.unit_id,
        partyId: caller.party_id,
        occurredAt: clock(),
        payload: {
          case_id: caseId,
          ...classification,
          channel: "voice",
          ...(title ? { title } : {}),
          description: issue.description,
          summary: issue.summary,
          ...(issue.conversation_id
            ? { conversation_id: issue.conversation_id }
            : {}),
        },
      })
      return caseId
    },
  })
  const caseId = ticket?.caseId
  if (!caseId) throw new Error("Voice ticket was not linked to a case")

  return {
    reference: caseRef(caseId),
    case_id: caseId,
    ticket_id: ticket.ticketId,
    title,
    where:
      issue.scope === "common"
        ? `${home.address}, common area`
        : `${home.address}, ${home.unit_label}`,
    next_step:
      issue.priority === "emergency"
        ? "Marked as an emergency for the property management team. If anyone is in danger, or there is fire or a smell of gas, call 112 now."
        : "The property management team will review it and arrange a visit if needed.",
  }
}

/** Short summary of the last finished call with this person, for continuity. */
export async function lastCallSummary(
  db: Exec,
  partyId: string
): Promise<string> {
  const [row] = await db
    .select({ payload: t.events.payload, at: t.events.occurredAt })
    .from(t.events)
    .where(
      and(eq(t.events.type, "call.completed"), eq(t.events.partyId, partyId))
    )
    .orderBy(desc(t.events.occurredAt))
    .limit(1)
  const summary = (row?.payload as { summary?: string } | undefined)?.summary
  return summary ? `${berlin(row!.at)}: ${summary}` : ""
}

/**
 * Dynamic variables for a support call. Every key always has a value: ElevenLabs
 * rejects a conversation when a variable used in the prompt is missing.
 */
export async function supportContext(db: Exec, caller: Caller | null) {
  const empty = {
    call_purpose: "support",
    caller_known: "no",
    party_id: "",
    caller_name: "",
    caller_first_name: "",
    caller_language: "de",
    caller_role: "",
    unit_id: "",
    address: "",
    unit_label: "",
    move_in_date: "",
    other_homes: "",
    open_cases: "none",
    last_call: "",
    today: toDay(now()),
  }
  if (!caller || caller.homes.length === 0) return empty
  const [home, ...others] = caller.homes
  const cases = await openCases(db, caller)
  return {
    ...empty,
    caller_known: "yes",
    party_id: caller.party_id,
    caller_name: caller.name,
    caller_first_name: caller.first_name,
    caller_language: (VOICE_LANGUAGES as readonly string[]).includes(
      caller.language
    )
      ? caller.language
      : "en",
    caller_role: home!.role,
    unit_id: home!.unit_id,
    address: home!.address,
    unit_label: home!.unit_label,
    move_in_date: home!.move_in ?? "",
    other_homes: others
      .map((h) => `${h.address}, ${h.unit_label} (${h.role})`)
      .join("; "),
    open_cases: cases.length
      ? cases
          .slice(0, 5)
          .map(
            (c) =>
              `${c.reference}: ${c.summary} [${c.status}${c.next_visit ? `, visit ${c.next_visit}${c.contractor ? ` by ${c.contractor}` : ""}` : ""}]`
          )
          .join("; ")
      : "none",
    last_call: await lastCallSummary(db, caller.party_id),
  }
}

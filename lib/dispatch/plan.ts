import type { TicketClassification } from "@/lib/tickets/classification"
import { addDays, isBusinessDay } from "@/lib/time"

import type { DispatchPriority } from "./steps"

/*
 * The decisions behind a dispatch, as plain code: category, appointment slot, the
 * message to the contractor and reading the contractor's yes or no.
 */

type Category = TicketClassification["category"]

/** The dashboard's demo requests, by id. */
const KNOWN: Record<string, Category> = {
  heating: "heating",
  leak: "plumbing",
  entry: "access_keys",
  inspection: "elevator",
  lighting: "electrical",
  intercom: "electrical",
}

const KEYWORDS: [Category, RegExp][] = [
  ["heating", /heiz|heating|radiator|boiler|therme|warmwasser|hot water/i],
  [
    "plumbing",
    /wasser|water|leak|leck|rohr|pipe|abfluss|drain|toilet|wc\b|sink|spüle|tropf/i,
  ],
  ["elevator", /aufzug|elevator|\blift\b/i],
  [
    "electrical",
    /strom|electric|power|licht|light|sicherung|fuse|steckdose|socket|gegensprech|intercom|klingel/i,
  ],
  ["damp_mould", /schimmel|mould|mold|feucht|damp/i],
  [
    "pests",
    /maus|mäuse|ratte|kakerlak|ungeziefer|\bmice\b|\brats?\b|cockroach|pest/i,
  ],
  ["access_keys", /schlüssel|schloss|\bkeys?\b|\block\b|tür|door/i],
  [
    "appliance",
    /herd|ofen|oven|kühlschrank|fridge|spülmaschine|dishwasher|waschmaschine/i,
  ],
  ["internet", /internet|wlan|wi-?fi/i],
]

export function categorize(
  requestKey: string,
  title: string,
  description: string
): Category {
  const known = KNOWN[requestKey]
  if (known) return known
  for (const text of [title, description])
    for (const [category, pattern] of KEYWORDS)
      if (pattern.test(text)) return category
  return "other"
}

export const CASE_PRIORITY: Record<DispatchPriority, string> = {
  Urgent: "emergency",
  High: "high",
  Routine: "normal",
}

// ------------------------------------------------------------------ slots

const ZONE = "Europe/Berlin"
const SLOT_HOURS = 2

/** Calendar day in Berlin, "YYYY-MM-DD". */
export function berlinDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(d)
}

/** The instant `hour`:00 Berlin time on `day`. */
export function berlinAt(day: string, hour: number): Date {
  const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`)
  const shown = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(guess)
  )
  const offset = ((shown - hour + 36) % 24) - 12
  return new Date(guess.getTime() - offset * 3_600_000)
}

/**
 * The first free two-hour window for the contractor. Urgent work goes to the emergency
 * service, any day 08–20 and at least two hours out; high priority waits for the next
 * business day, routine work for three business days. A window is taken when the
 * contractor already has a job starting less than two hours from it.
 */
export function planSlot(
  now: Date,
  priority: DispatchPriority,
  busy: Date[]
): { start: Date; end: Date } {
  const urgent = priority === "Urgent"
  const hours = urgent ? [8, 10, 12, 14, 16, 18] : [8, 10, 12, 14]
  const earliest = now.getTime() + 2 * 3_600_000
  let day = berlinDay(now)
  let businessDaysToSkip = urgent ? 0 : priority === "High" ? 1 : 3
  const clash = (start: Date) =>
    busy.some(
      (b) => Math.abs(b.getTime() - start.getTime()) < SLOT_HOURS * 3_600_000
    )

  for (let i = 0; i < 60; i++, day = addDays(day, 1)) {
    if (!urgent) {
      if (!isBusinessDay(day)) continue
      if (businessDaysToSkip > 0 && day !== berlinDay(now)) businessDaysToSkip--
      if (day === berlinDay(now) || businessDaysToSkip > 0) continue
    }
    for (const hour of hours) {
      const start = berlinAt(day, hour)
      if (start.getTime() < earliest || clash(start)) continue
      return {
        start,
        end: new Date(start.getTime() + SLOT_HOURS * 3_600_000),
      }
    }
  }
  throw new Error("no slot in the next 60 days")
}

// ------------------------------------------------------------------ message

const PRIORITY_LINE: Record<"de" | "en", Record<DispatchPriority, string>> = {
  de: {
    Urgent: "Dringender Auftrag",
    High: "Auftrag mit hoher Priorität",
    Routine: "Neuer Auftrag",
  },
  en: {
    Urgent: "Urgent job",
    High: "High-priority job",
    Routine: "New job",
  },
}

export function slotLabel(
  slot: { start: Date; end: Date },
  language: "de" | "en"
) {
  const intl = language === "de" ? "de-DE" : "en-GB"
  const day = new Intl.DateTimeFormat(intl, {
    timeZone: ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(slot.start)
  const time = new Intl.DateTimeFormat(intl, {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
  })
  return { day, from: time.format(slot.start), to: time.format(slot.end) }
}

export function composeMessage(input: {
  language: "de" | "en"
  priority: DispatchPriority
  title: string
  description: string
  address: string
  slot: { start: Date; end: Date }
}) {
  const { day, from, to } = slotLabel(input.slot, input.language)
  const what = PRIORITY_LINE[input.language][input.priority]
  // What was observed, not the manager's notes on what to do: the first sentence.
  const description = (
    input.description.trim().split(/(?<=[.!?])\s/)[0] ?? ""
  ).slice(0, 280)
  return input.language === "de"
    ? [
        "Guten Tag, hier ist Cora, die KI-Assistentin der Hausverwaltung.",
        `${what}: ${input.title}, ${input.address}.`,
        description,
        `Können Sie am ${day} zwischen ${from} und ${to} Uhr vorbeikommen? Bitte antworten Sie mit Ja oder Nein.`,
      ]
        .filter(Boolean)
        .join("\n\n")
    : [
        "Hello, this is Cora, the property manager's AI assistant.",
        `${what}: ${input.title}, ${input.address}.`,
        description,
        `Could you come on ${day} between ${from} and ${to}? Please reply yes or no.`,
      ]
        .filter(Boolean)
        .join("\n\n")
}

/** Reads a contractor's reply. Null when it's neither a clear yes nor a clear no. */
export function readReply(text: string): boolean | null {
  const t = text.trim().toLowerCase()
  if (/\b(nein|no|nope)\b|geht nicht|kann nicht|leider|keine zeit|👎/.test(t))
    return false
  if (
    /\b(ja|jo|yes|yep|ok|okay|passt|klappt|gerne|bestätigt?|confirmed?|sure)\b|👍|✅/.test(
      t
    )
  )
    return true
  return null
}

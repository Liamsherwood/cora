import type { TicketClassification } from "@/lib/tickets/classification"
import { addDays, isBusinessDay } from "@/lib/time"

/**
 * The first visit a contractor could offer, by urgency. Plain rules, no model: an
 * emergency service turns out within 90 minutes; otherwise visits start at fixed times
 * on working days (Saturdays too when urgent) and skip the contractor's booked jobs.
 * In production the contractor confirms or counters the slot; the demo takes it as given.
 */

const VISIT_HOURS = [8, 10, 13, 15]
const VISIT_LENGTH_MS = 2 * 3_600_000
const SEARCH_DAYS = 21

const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin",
  timeZoneName: "shortOffset",
})
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
})

/** Minutes Berlin is ahead of UTC at that instant ("GMT+1" -> 60). */
function berlinOffset(at: Date): number {
  const name =
    offsetFormat.formatToParts(at).find((p) => p.type === "timeZoneName")
      ?.value ?? "GMT"
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name)
  if (!m) return 0
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0))
}

/** `hour`:00 Berlin time on `day` ("YYYY-MM-DD") as an instant. */
export function berlinTime(day: string, hour: number): Date {
  const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`)
  return new Date(guess.getTime() - berlinOffset(guess) * 60_000)
}

export function berlinDay(at: Date): string {
  return dayFormat.format(at)
}

function isSaturday(day: string) {
  return new Date(`${day}T12:00:00Z`).getUTCDay() === 6
}

export function proposeVisit(
  priority: TicketClassification["priority"],
  at: Date,
  booked: Date[] = []
): Date {
  if (priority === "emergency") {
    const quarter = 15 * 60_000
    return new Date(Math.ceil((at.getTime() + 90 * 60_000) / quarter) * quarter)
  }
  const earliest =
    priority === "high"
      ? new Date(at.getTime() + 3 * 3_600_000)
      : berlinTime(addDays(berlinDay(at), priority === "low" ? 3 : 1), 0)
  const free = (slot: Date) =>
    booked.every(
      (b) => Math.abs(b.getTime() - slot.getTime()) >= VISIT_LENGTH_MS
    )
  const start = berlinDay(earliest)
  for (let i = 0; i < SEARCH_DAYS; i++) {
    const day = addDays(start, i)
    if (!isBusinessDay(day) && !(priority === "high" && isSaturday(day)))
      continue
    for (const hour of VISIT_HOURS) {
      const slot = berlinTime(day, hour)
      if (slot >= earliest && free(slot)) return slot
    }
  }
  // A fully booked contractor still gets a date: the first slot after the window.
  return berlinTime(addDays(start, SEARCH_DAYS), VISIT_HOURS[0]!)
}

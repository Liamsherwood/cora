/**
 * Date helpers. Calendar days are plain "YYYY-MM-DD" strings handled in UTC so
 * a move-in on 1 Dec never turns into 30 Nov because of a server timezone.
 */

const BOOT = Date.now()

/**
 * Business "now". DEMO_NOW starts the clock at a fixed moment (so the demo's
 * business-day maths is reproducible) and then lets it run.
 */
export function now(): Date {
  const pinned = process.env.DEMO_NOW
  if (pinned) {
    const start = new Date(pinned).getTime()
    if (!Number.isNaN(start)) return new Date(start + (Date.now() - BOOT))
  }
  return new Date()
}

let lastMs = 0

/**
 * Timestamp for rows (messages, audit events). Real clock, but strictly increasing
 * within the process, so two rows written in the same millisecond still sort in
 * the order they were written. DEMO_NOW only affects business logic, not this.
 */
export function clock(): Date {
  const ms = Math.max(Date.now(), lastMs + 1)
  lastMs = ms
  return new Date(ms)
}

export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseDay(day: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) throw new Error(`invalid day: ${day}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

/**
 * Nationwide German public holidays that fall in the demo window. A real system
 * would use a per-state calendar; this is listed as an assumption.
 */
const HOLIDAYS = new Set(["2026-12-25", "2026-12-26", "2027-01-01"])

export function isBusinessDay(day: string): boolean {
  const wd = parseDay(day).getUTCDay()
  return wd !== 0 && wd !== 6 && !HOLIDAYS.has(day)
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day)
  d.setUTCDate(d.getUTCDate() + n)
  return toDay(d)
}

/** The date reached after `n` full business days counted from (but excluding) `from`. */
export function addBusinessDays(from: string, n: number): string {
  let d = from
  let left = n
  while (left > 0) {
    d = addDays(d, 1)
    if (isBusinessDay(d)) left--
  }
  return d
}

/** Business days strictly after `from` up to and including `to`. */
export function businessDaysBetween(from: string, to: string): number {
  if (to <= from) return 0
  let count = 0
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1))
    if (isBusinessDay(d)) count++
  return count
}

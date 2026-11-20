/** Display formatting shared by the demo screens (server and client). */

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
})

/** Integer cents (offer snapshot, metrics) -> "34,99 €". */
export const eur = (cents: number) => EUR.format(cents / 100)

/** EUR decimal string from a money column ("34.99") -> "34,99 €". */
export const eurDecimal = (v: string | null | undefined) =>
  v == null ? "–" : EUR.format(Number(v))

/** "2026-12-01" -> "1 Dec 2026" (calendar day, no timezone shift). */
export const day = (d: string | null | undefined) =>
  d
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "–"

/** Timestamp -> "09:14" in German time (rendered on the server, so the zone is explicit). */
export const time = (ts: Date | string | null | undefined) => {
  if (!ts) return "–"
  const d = new Date(ts)
  return Number.isNaN(d.getTime())
    ? "–"
    : d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Berlin",
      })
}

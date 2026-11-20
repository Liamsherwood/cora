/**
 * The database stores EUR as exact decimals (Drizzle returns them as strings).
 * Inside the engine, arithmetic happens in integer cents. These two functions are
 * the only place the two meet, and neither goes through floating point.
 */

/** 3499 -> "34.99"; with scale 4: 30 -> "0.3000". */
export function centsToEur(cents: number, scale = 2): string {
  if (!Number.isInteger(cents))
    throw new Error(`cents must be an integer: ${cents}`)
  if (scale < 2) throw new Error("scale must be at least 2")
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, "0") + "0".repeat(scale - 2)
  return `${sign}${whole}.${frac}`
}

/** "34.99" -> 3499; "0.3050" -> 31 (half-up on the third decimal). */
export function eurToCents(eur: string | null | undefined): number {
  if (eur == null || eur === "") return 0
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(eur.trim())
  if (!m) throw new Error(`not a decimal amount: ${eur}`)
  const frac = (m[3] ?? "").padEnd(3, "0")
  let cents = Number(m[2]) * 100 + Number(frac.slice(0, 2))
  if (Number(frac[2]) >= 5) cents += 1
  return m[1] ? -cents : cents
}

export function formatEur(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100)
}

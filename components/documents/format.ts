import { formatMessage as fm } from "@/lib/i18n/format-message"
import type { Messages } from "@/lib/i18n/dictionaries"
import { localeSettings, type Locale } from "@/lib/i18n/locales"
import { eurToCents } from "@/lib/money"

export type DocumentMessages = Messages["documents"]

/** "1st", "2nd", "3rd", "4th", "11th", "21st". */
function englishOrdinal(n: number) {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`
}

/**
 * Formatting for printed documents: long dates ("1 December 2026" / "1. Dezember 2026"),
 * EUR amounts and German-style floor names. Calendar days are formatted in UTC so they
 * never shift; moments (consent given at) in German time.
 */
export function documentFormat(locale: Locale, m: DocumentMessages) {
  const intl = localeSettings[locale].intlLocale
  const eur = new Intl.NumberFormat(intl, {
    style: "currency",
    currency: "EUR",
  })
  const number = new Intl.NumberFormat(intl, { maximumFractionDigits: 2 })
  const day = new Intl.DateTimeFormat(intl, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
  const dateTime = new Intl.DateTimeFormat(intl, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  })
  const list = new Intl.ListFormat(intl, { type: "conjunction" })

  const floor = (n: number) =>
    n === 0
      ? m.common.floors.ground
      : n < 0
        ? m.common.floors.basement
        : fm(m.common.floors.upper, {
            n: locale === "en" ? englishOrdinal(n) : String(n),
          })

  return {
    /** EUR decimal string from a money column ("780.00"). */
    eur: (v: string) => eur.format(eurToCents(v) / 100),
    /** Three monthly net rents, the most a deposit or guarantee may be (§ 551 BGB). */
    threeRents: (v: string) => eur.format((eurToCents(v) * 3) / 100),
    number: (n: number) => number.format(n),
    day: (d: string) => day.format(new Date(`${d}T12:00:00Z`)),
    dateTime: (d: Date) => dateTime.format(d),
    /** "Lena Hoffmann and Jonas Weber". */
    list: (items: string[]) => list.format(items),
    floor,
    /** "Flat 4B, 2nd floor". */
    flat: (unit: string, floorNumber: number | null) =>
      floorNumber === null
        ? `${m.common.flat} ${unit}`
        : fm(m.common.flatValue, { unit, floor: floor(floorNumber) }),
    /**
     * Co-ownership share in thousandths. The records hold it either as a fraction of the
     * whole (0.0530) or already in thousandths (68.5).
     */
    mea: (v: string | null) => {
      if (v === null) return null
      const n = Number(v)
      if (!Number.isFinite(n)) return null
      return fm(m.ownerSheet.shareValue, {
        share: number.format(n < 1 ? n * 1000 : n),
      })
    },
  }
}

export type DocumentFormat = ReturnType<typeof documentFormat>

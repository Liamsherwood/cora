import { localeSettings, type Locale } from "@/lib/i18n/locales"

/**
 * Locale-aware display formatting for the directory (rendered on the server, so every
 * time zone is explicit: calendar days in UTC, timestamps in German time).
 */
export function directoryFormat(locale: Locale) {
  const intl = localeSettings[locale].intlLocale
  const eur = new Intl.NumberFormat(intl, {
    style: "currency",
    currency: "EUR",
  })
  const number = new Intl.NumberFormat(intl)
  const dayFormat = new Intl.DateTimeFormat(intl, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
  const timeFormat = new Intl.DateTimeFormat(intl, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  })
  const dateTimeFormat = new Intl.DateTimeFormat(intl, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  })
  const timestamp =
    (f: Intl.DateTimeFormat) => (ts: Date | string | null | undefined) => {
      if (!ts) return "–"
      const d = new Date(ts)
      return Number.isNaN(d.getTime()) ? "–" : f.format(d)
    }
  return {
    number: number.format,
    /** Integer cents (offer snapshot, metrics). */
    cents: (cents: number) => eur.format(cents / 100),
    /** EUR decimal string from a money column ("34.99"). */
    eur: (v: string | null | undefined) =>
      v == null ? "–" : eur.format(Number(v)),
    /** Calendar day "2026-12-01", no time zone shift. */
    day: (d: string | null | undefined) =>
      d ? dayFormat.format(new Date(`${d}T12:00:00Z`)) : "–",
    time: timestamp(timeFormat),
    dateTime: timestamp(dateTimeFormat),
  }
}

export type DirectoryFormat = ReturnType<typeof directoryFormat>

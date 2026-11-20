import "server-only"

import { localeSettings, type Locale } from "@/lib/i18n/locales"

const rentHistory = [
  { month: Date.UTC(2026, 3), collected: 84900, expected: 93000 },
  { month: Date.UTC(2026, 4), collected: 92400, expected: 100000 },
  { month: Date.UTC(2026, 5), collected: 103250, expected: 109000 },
  { month: Date.UTC(2026, 6), collected: 112560, expected: 118000 },
  { month: Date.UTC(2026, 7), collected: 107900, expected: 118000 },
  { month: Date.UTC(2026, 8), collected: 119600, expected: 127000 },
  { month: Date.UTC(2026, 9), collected: 122800, expected: 132000 },
  { month: Date.UTC(2026, 10), collected: 128450, expected: 134000 },
]

export type RentPeriod = (typeof rentHistory)[number] & {
  shortMonth: string
  shortMonthYear: string
  longMonthYear: string
}

export function getRentHistory(locale: Locale): RentPeriod[] {
  const regionalLocale = localeSettings[locale].intlLocale
  const shortMonth = new Intl.DateTimeFormat(regionalLocale, {
    month: "short",
    timeZone: "UTC",
  })
  const shortMonthYear = new Intl.DateTimeFormat(regionalLocale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
  const longMonthYear = new Intl.DateTimeFormat(regionalLocale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  // Keep prerender and hydration consistent across browser ICU versions.
  return rentHistory.map((period) => ({
    ...period,
    shortMonth: shortMonth.format(period.month),
    shortMonthYear: shortMonthYear.format(period.month),
    longMonthYear: longMonthYear.format(period.month),
  }))
}

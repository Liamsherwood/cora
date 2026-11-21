import "server-only"

import type { RentMonth } from "@/lib/centrix/portfolio"
import { localeSettings, type Locale } from "@/lib/i18n/locales"

export type RentPeriod = RentMonth & {
  shortMonth: string
  shortMonthYear: string
  longMonthYear: string
}

export function getRentHistory(
  rentRoll: RentMonth[],
  locale: Locale
): RentPeriod[] {
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
  return rentRoll.map((period) => ({
    ...period,
    shortMonth: shortMonth.format(period.month),
    shortMonthYear: shortMonthYear.format(period.month),
    longMonthYear: longMonthYear.format(period.month),
  }))
}

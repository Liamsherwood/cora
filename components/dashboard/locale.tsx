"use client"

import { createContext, use, useMemo, type ReactNode } from "react"

import type { Messages } from "@/lib/i18n/dictionaries"
import { localeSettings, type Locale } from "@/lib/i18n/locales"

type DashboardMessages = Messages["dashboard"]

function createFormatters(locale: Locale) {
  const regionalLocale = localeSettings[locale].intlLocale
  const number = new Intl.NumberFormat(regionalLocale)
  const currency = new Intl.NumberFormat(regionalLocale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  })
  const percent = new Intl.NumberFormat(regionalLocale, { style: "percent" })
  const precisePercent = new Intl.NumberFormat(regionalLocale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  const percentChange = new Intl.NumberFormat(regionalLocale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  })
  return {
    number: number.format,
    currency: currency.format,
    percent: percent.format,
    precisePercent: precisePercent.format,
    percentChange: percentChange.format,
  }
}

type DashboardLocale = {
  locale: Locale
  messages: DashboardMessages
  format: ReturnType<typeof createFormatters>
}

const LocaleContext = createContext<DashboardLocale | null>(null)

export function DashboardLocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale
  messages: DashboardMessages
  children: ReactNode
}) {
  const format = useMemo(() => createFormatters(locale), [locale])

  return (
    <LocaleContext value={{ locale, messages, format }}>
      {children}
    </LocaleContext>
  )
}

export function useDashboardLocale() {
  const context = use(LocaleContext)
  if (!context) throw new Error("DashboardLocaleProvider is missing")
  return context
}

// Server components import it from "@/lib/i18n/format-message" directly.
export { formatMessage } from "@/lib/i18n/format-message"

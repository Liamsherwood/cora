import { notFound } from "next/navigation"
import { connection } from "next/server"

import { Dashboard } from "@/components/dashboard/dashboard"
import { DashboardLocaleProvider } from "@/components/dashboard/locale"
import { PortfolioProvider } from "@/components/dashboard/portfolio"
import { getRentHistory } from "@/components/dashboard/rent-history"
import { isView } from "@/components/dashboard/views"
import { CoraActivityCard } from "@/components/tickets/cora-activity-card"
import { getPortfolioOverview } from "@/lib/centrix/portfolio"
import { getDb } from "@/lib/db"
import { getMessages } from "@/lib/i18n/dictionaries"
import { isLocale } from "@/lib/i18n/locales"
import { now, toDay } from "@/lib/time"

export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]">) {
  await connection()
  const [{ locale }, { view }] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const [messages, portfolio] = await Promise.all([
    getMessages(locale),
    getPortfolioOverview(getDb(), toDay(now())),
  ])

  return (
    <DashboardLocaleProvider locale={locale} messages={messages.dashboard}>
      <PortfolioProvider properties={portfolio.properties}>
        <Dashboard
          rentHistory={getRentHistory(portfolio.rentRoll, locale)}
          initialView={isView(view) ? view : undefined}
          coraActivity={
            <CoraActivityCard locale={locale} messages={messages} />
          }
        />
      </PortfolioProvider>
    </DashboardLocaleProvider>
  )
}

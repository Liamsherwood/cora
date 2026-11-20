import { notFound } from "next/navigation"

import { Dashboard } from "@/components/dashboard/dashboard"
import { DashboardLocaleProvider } from "@/components/dashboard/locale"
import { getRentHistory } from "@/components/dashboard/rent-history"
import { getMessages } from "@/lib/i18n/dictionaries"
import { isLocale } from "@/lib/i18n/locales"

export default async function Page({ params }: PageProps<"/[locale]">) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { dashboard } = await getMessages(locale)

  return (
    <DashboardLocaleProvider locale={locale} messages={dashboard}>
      <Dashboard rentHistory={getRentHistory(locale)} />
    </DashboardLocaleProvider>
  )
}

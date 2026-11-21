import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { DashboardLocaleProvider } from "@/components/dashboard/locale"
import { WorkspaceShell } from "@/components/dashboard/workspace"
import { DocumentsTab } from "@/components/directory/documents"
import { directoryFormat } from "@/components/directory/format"
import { PartnersTab } from "@/components/directory/partners"
import { PeopleTab } from "@/components/directory/people"
import { DirectoryTabs, isDirectoryTab } from "@/components/directory/ui"
import { UnitsTab } from "@/components/directory/units"
import { WorkflowsTab } from "@/components/directory/workflows"
import { AutoRefresh } from "@/components/partner-connect/auto-refresh"
import { getDirectoryCounts } from "@/lib/centrix/directory"
import { isDocumentKind, listFiledDocuments } from "@/lib/centrix/documents"
import { getDb } from "@/lib/db"
import { getMessages } from "@/lib/i18n/dictionaries"
import { isLocale } from "@/lib/i18n/locales"

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/services">): Promise<Metadata> {
  const { locale } = await params
  const title = isLocale(locale)
    ? (await getMessages(locale)).directory.title
    : "Directory"
  return {
    title: `${title} · Centrix`,
    robots: { index: false, follow: false },
  }
}

const one = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined

/**
 * The property manager's directory of everything in centrix: units (with the partner
 * services on them: the moment centrix detected, the workflows it started and the
 * contracts written back), people, partners and all workflows. URL-driven, so every
 * view can be linked and the page re-renders live while a demo runs.
 */
export default async function DirectoryPage({
  params,
  searchParams,
}: PageProps<"/[locale]/services">) {
  await connection()
  const [{ locale }, sp] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const tab = isDirectoryTab(sp.tab) ? sp.tab : "units"
  const q = (one(sp.q) ?? "").slice(0, 100)
  const page = /^[1-9]\d{0,5}$/.test(one(sp.page) ?? "") ? Number(sp.page) : 1

  const db = getDb()
  const [{ dashboard, directory: messages, documents }, counts, filed] =
    await Promise.all([
      getMessages(locale),
      getDirectoryCounts(db),
      listFiledDocuments(db),
    ])
  const format = directoryFormat(locale)
  const shared = { db, locale, messages, format }

  return (
    <DashboardLocaleProvider locale={locale} messages={dashboard}>
      <WorkspaceShell current="services" title={messages.title}>
        <AutoRefresh />
        <DirectoryTabs
          locale={locale}
          current={tab}
          counts={{ ...counts, documents: filed.length }}
          messages={messages}
          formatNumber={format.number}
        />
        {tab === "units" && (
          <UnitsTab
            {...shared}
            documents={documents}
            q={q}
            unitParam={one(sp.unit)}
            runParam={one(sp.run)}
          />
        )}
        {tab === "people" && (
          <PeopleTab
            {...shared}
            documents={documents}
            q={q}
            page={page}
            personParam={one(sp.person)}
          />
        )}
        {tab === "documents" && (
          <DocumentsTab
            locale={locale}
            messages={messages}
            documents={documents}
            format={format}
            filed={filed}
            q={q}
            kind={isDocumentKind(sp.kind) ? sp.kind : null}
            page={page}
          />
        )}
        {tab === "partners" && <PartnersTab {...shared} />}
        {tab === "workflows" && <WorkflowsTab {...shared} page={page} />}
      </WorkspaceShell>
    </DashboardLocaleProvider>
  )
}

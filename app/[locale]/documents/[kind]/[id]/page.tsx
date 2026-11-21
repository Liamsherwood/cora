import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { cache } from "react"

import { documentFormat } from "@/components/documents/format"
import { PrintButton } from "@/components/documents/print-button"
import { Sheet } from "@/components/documents/sheet"
import { DocumentBody, documentTitle } from "@/components/documents/templates"
import { buttonVariants } from "@/components/ui/button"
import { isDocumentKind, loadDocument } from "@/lib/centrix/documents"
import { getDb } from "@/lib/db"
import { getMessages } from "@/lib/i18n/dictionaries"
import { isLocale } from "@/lib/i18n/locales"

type Props = PageProps<"/[locale]/documents/[kind]/[id]">

const one = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined

/** One fill per request, shared by the metadata and the page. */
const load = cache(async (kind: string, id: string, party?: string) =>
  isDocumentKind(kind) ? loadDocument(getDb(), kind, id, party) : null
)

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ locale, kind, id }, sp] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) return {}
  const [record, { documents: m }] = await Promise.all([
    load(kind, id, one(sp.party)),
    getMessages(locale),
  ])
  return {
    title: record ? `${documentTitle(record, m)} · Centrix` : "Centrix",
    robots: { index: false, follow: false },
  }
}

/**
 * A document from the property manager's files, filled from the centrix records when it
 * is opened. Printable, and savable as a PDF from the print dialog.
 */
export default async function DocumentPage({ params, searchParams }: Props) {
  await connection()
  const [{ locale, kind, id }, sp] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const [record, { documents: m }] = await Promise.all([
    load(kind, id, one(sp.party)),
    getMessages(locale),
  ])
  if (!record) notFound()
  const f = documentFormat(locale, m)

  return (
    <div className="min-h-svh bg-muted print:bg-white">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-3 px-4 py-3">
          <Link
            href={`/${locale}/services`}
            className={buttonVariants({ variant: "ghost" })}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" />
            {m.back}
          </Link>
          <PrintButton label={m.print} />
        </div>
      </div>
      <main className="px-4 py-6 sm:py-10 print:p-0">
        <Sheet>
          <DocumentBody record={record} m={m} f={f} />
        </Sheet>
      </main>
    </div>
  )
}

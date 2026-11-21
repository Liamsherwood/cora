import Link from "next/link"

import type { DocumentMessages } from "@/components/documents/format"
import { buttonVariants } from "@/components/ui/button"
import { DIRECTORY_PAGE_SIZE } from "@/lib/centrix/directory"
import {
  DOCUMENT_KINDS,
  documentHref,
  documentRef,
  type DocumentKind,
  type FiledDocument,
} from "@/lib/centrix/documents"
import { formatMessage as fm } from "@/lib/i18n/format-message"
import { cn } from "@/lib/utils"

import type { DirectoryFormat } from "./format"
import {
  directoryHref,
  Empty,
  Pager,
  Panel,
  SearchForm,
  type DirectoryMessages,
} from "./ui"

const placeText = (d: FiledDocument) =>
  d.place ? [d.place.address, d.place.unit].filter(Boolean).join(" · ") : null

/**
 * Documents: everything in the property manager's files, by property and unit. Each
 * entry opens its filled copy in a new tab. Search matches the document type, its
 * reference, the people on it and the address.
 */
export function DocumentsTab({
  locale,
  q,
  kind,
  page,
  filed,
  messages,
  documents: dm,
  format,
}: {
  locale: string
  q: string
  kind: DocumentKind | null
  page: number
  filed: FiledDocument[]
  messages: DirectoryMessages
  documents: DocumentMessages
  format: DirectoryFormat
}) {
  const m = messages.document
  const words = q.toLocaleLowerCase(locale).split(/\s+/).filter(Boolean)
  const matching = words.length
    ? filed.filter((d) => {
        const text = [
          dm.kinds[d.kind],
          documentRef(d.kind, d.id, d.party),
          d.subject,
          placeText(d),
        ]
          .join(" ")
          .toLocaleLowerCase(locale)
        return words.every((w) => text.includes(w))
      })
    : filed
  const counts = new Map<DocumentKind, number>()
  for (const d of matching) counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1)
  const shown = kind ? matching.filter((d) => d.kind === kind) : matching
  const pages = Math.max(1, Math.ceil(shown.length / DIRECTORY_PAGE_SIZE))
  const current = Math.min(page, pages)
  const rows = shown.slice(
    (current - 1) * DIRECTORY_PAGE_SIZE,
    current * DIRECTORY_PAGE_SIZE
  )
  const href = (params: { kind?: DocumentKind | null; page?: number }) =>
    directoryHref(locale, { tab: "documents", q, kind, ...params })

  const chip = (target: DocumentKind | null, label: string, n: number) => (
    <Link
      key={target ?? "all"}
      href={href({ kind: target, page: 1 })}
      aria-current={target === kind ? "page" : undefined}
      className={cn(
        buttonVariants({
          variant: target === kind ? "secondary" : "ghost",
          size: "sm",
        }),
        "rounded-(--radius-chip)"
      )}
    >
      <span className="flex items-baseline gap-1.5">
        {label}
        <span className="text-xs font-normal tabular-nums text-muted-foreground">
          {format.number(n)}
        </span>
      </span>
    </Link>
  )

  return (
    <Panel flush>
      <div className="grid gap-3 border-b border-border p-3">
        <SearchForm
          locale={locale}
          tab="documents"
          q={q}
          placeholder={messages.searchDocuments}
          messages={messages}
          hidden={kind ? { kind } : undefined}
        />
        {filed.length > 0 && (
          <nav aria-label={m.types} className="flex flex-wrap gap-1">
            {chip(null, m.all, matching.length)}
            {DOCUMENT_KINDS.filter((k) => counts.has(k) || k === kind).map(
              (k) => chip(k, dm.kinds[k], counts.get(k) ?? 0)
            )}
          </nav>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-4 sm:px-6">
          <Empty>{filed.length === 0 ? m.empty : messages.noResults}</Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">
                  {m.name}
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  {m.concerns}
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2.5 font-medium sm:table-cell"
                >
                  {m.place}
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2.5 pr-4 font-medium sm:pr-6 md:table-cell"
                >
                  {m.date}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => {
                const place =
                  d.kind === "owner_sheet" && d.units !== undefined
                    ? fm(dm.unitsCount, { count: format.number(d.units) })
                    : placeText(d)
                const subject =
                  d.kind === "energy"
                    ? [
                        d.building &&
                          fm(m.building, {
                            number: format.number(d.building.number),
                            total: format.number(d.building.of),
                          }),
                        d.energyClass &&
                          fm(dm.energyClass, { class: d.energyClass }),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : d.subject
                return (
                  <tr
                    key={`${d.kind}-${d.id}-${d.party ?? ""}`}
                    className="hover:bg-muted/50"
                  >
                    <th scope="row" className="px-4 py-2.5 font-normal sm:px-6">
                      <a
                        href={documentHref(locale, d)}
                        target="_blank"
                        rel="noopener"
                        className="font-medium hover:underline"
                      >
                        {dm.kinds[d.kind]}
                        <span className="sr-only"> ({dm.newTab})</span>
                      </a>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {documentRef(d.kind, d.id, d.party)}
                        {place && <span className="sm:hidden"> · {place}</span>}
                      </p>
                    </th>
                    <td className="px-3 py-2.5">{subject || "–"}</td>
                    <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">
                      {place ?? "–"}
                    </td>
                    <td className="hidden px-3 py-2.5 pr-4 tabular-nums whitespace-nowrap text-muted-foreground sm:pr-6 md:table-cell">
                      {!d.when
                        ? "–"
                        : "day" in d.when
                          ? format.day(d.when.day)
                          : format.dateTime(d.when.at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        page={current}
        hasNext={current < pages}
        href={(n) => href({ page: n })}
        messages={messages}
      />
    </Panel>
  )
}

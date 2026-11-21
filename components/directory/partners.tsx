import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { listPartners } from "@/lib/centrix/directory"
import type { DB } from "@/lib/db"
import { formatMessage as fm } from "@/lib/i18n/format-message"

import type { DirectoryFormat } from "./format"
import { Empty, Fact, Panel, type DirectoryMessages } from "./ui"

/** Partners: every connected partner (from its manifest) with its offers and usage. */
export async function PartnersTab({
  db,
  locale,
  messages,
  format,
}: {
  db: DB
  locale: string
  messages: DirectoryMessages
  format: DirectoryFormat
}) {
  const m = messages.partner
  const partners = await listPartners(db)
  if (partners.length === 0)
    return (
      <Panel>
        <Empty>{messages.none}</Empty>
      </Panel>
    )

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {partners.map((p) => (
        <Panel
          key={p.id}
          title={p.name}
          description={fm(m.usage, {
            workflows: format.number(p.workflows),
            orders: format.number(p.orders),
          })}
          action={
            <Link
              href={`/${locale}/partner`}
              className={buttonVariants({ variant: "outline" })}
            >
              {m.openDashboard} →
            </Link>
          }
          flush
        >
          <dl className="grid grid-cols-3 gap-x-6 gap-y-3 px-5 py-4 sm:px-6">
            <Fact
              label={m.category}
              value={
                m.categories[p.category as keyof typeof m.categories] ??
                p.category
              }
            />
            <Fact
              label={m.regions}
              value={p.regions.length ? p.regions.join(", ") : "–"}
            />
            <Fact
              label={m.channels}
              value={
                p.channels.length ? (
                  <span className="flex flex-wrap gap-1">
                    {p.channels.map((c) => (
                      <Badge key={c} variant="secondary">
                        {c}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  "–"
                )
              }
            />
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{m.offers}</caption>
              <thead className="border-y border-border bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">
                    {m.product}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    {m.price}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 pr-4 font-medium sm:pr-6"
                  >
                    {m.leadTime}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {p.offers.map((o) => (
                  <tr key={o.id}>
                    <th scope="row" className="px-4 py-2.5 font-medium sm:px-6">
                      {o.product}
                      <p className="text-xs font-normal text-muted-foreground">
                        {o.key}
                      </p>
                    </th>
                    <td className="px-3 py-2.5 tabular-nums">
                      {format.eur(o.monthlyPriceEur)}
                    </td>
                    <td className="px-3 py-2.5 pr-4 tabular-nums sm:pr-6">
                      {o.leadTimeBusinessDays == null
                        ? "–"
                        : fm(m.leadTimeValue, {
                            days: format.number(o.leadTimeBusinessDays),
                          })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </div>
  )
}

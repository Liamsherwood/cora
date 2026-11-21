import Link from "next/link"

import { StateBadge } from "@/components/partner-connect/status"
import { DIRECTORY_PAGE_SIZE, listAllRuns } from "@/lib/centrix/directory"
import type { DB } from "@/lib/db"

import type { DirectoryFormat } from "./format"
import {
  directoryHref,
  Empty,
  Pager,
  Panel,
  serviceName,
  type DirectoryMessages,
} from "./ui"

/** Workflows: every partner workflow across the portfolio, latest activity first. */
export async function WorkflowsTab({
  db,
  locale,
  page,
  messages,
  format,
}: {
  db: DB
  locale: string
  page: number
  messages: DirectoryMessages
  format: DirectoryFormat
}) {
  const m = messages.workflow
  const rows = await listAllRuns(db, { page })
  const runs = rows.slice(0, DIRECTORY_PAGE_SIZE)

  return (
    <Panel flush>
      {runs.length === 0 ? (
        <div className="px-5 py-4 sm:px-6">
          <Empty>{m.empty}</Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">
                  {m.unit}
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  {m.service}
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  {m.state}
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2.5 font-medium sm:table-cell"
                >
                  {m.tenant}
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2.5 pr-4 font-medium sm:pr-6 md:table-cell"
                >
                  {m.updated}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-muted/50">
                  <th scope="row" className="px-4 py-2.5 font-normal sm:px-6">
                    <Link
                      href={directoryHref(locale, {
                        unit: r.unitId,
                        run: r.id,
                      })}
                      className="font-medium hover:underline"
                      aria-label={`${m.open}: ${r.address} · ${r.unit}`}
                    >
                      {r.address} · {r.unit}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.eventType}
                    </p>
                  </th>
                  <td className="px-3 py-2.5">
                    {serviceName(messages.run, r.category, r.partner)}
                  </td>
                  <td className="px-3 py-2.5">
                    <StateBadge state={r.state} />
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">
                    {r.partyId ? (
                      <Link
                        href={directoryHref(locale, {
                          tab: "people",
                          person: r.partyId,
                        })}
                        className="hover:underline"
                      >
                        {r.party}
                      </Link>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="hidden px-3 py-2.5 pr-4 tabular-nums text-muted-foreground sm:pr-6 md:table-cell">
                    {format.dateTime(r.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        page={page}
        hasNext={rows.length > DIRECTORY_PAGE_SIZE}
        href={(n) => directoryHref(locale, { tab: "workflows", page: n })}
        messages={messages}
      />
    </Panel>
  )
}

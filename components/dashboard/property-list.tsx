import {
  ArrowRight01Icon,
  ArrowRightIcon,
  Building03Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

import { activeRequests, type Property, type Request } from "./data"
import { formatMessage, useDashboardLocale } from "./locale"
import { useProperties } from "./portfolio"
import { normalizeSearch } from "./search"

const previewLimit = 6

export function PropertyList({
  requests,
  onProperty,
  onViewAll,
}: {
  requests: Request[]
  onProperty: (property: Property) => void
  onViewAll?: () => void
}) {
  const { messages, format } = useDashboardLocale()
  const properties = useProperties()
  const [query, setQuery] = useState("")
  const search = normalizeSearch(query.trim())
  const rows = onViewAll
    ? properties.slice(0, previewLimit)
    : properties.filter(({ name, address }) =>
        normalizeSearch(`${name} ${address}`).includes(search)
      )
  const openCounts = new Map<string, number>()
  for (const { propertyId } of activeRequests(requests)) {
    openCounts.set(propertyId, (openCounts.get(propertyId) ?? 0) + 1)
  }

  return (
    <section
      aria-label={messages.nav.properties}
      className="overflow-hidden rounded-(--radius-card) border border-border bg-card shadow-panel"
    >
      <div className="flex min-h-[76px] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-3.5 py-4 sm:px-6">
        {onViewAll ? (
          <>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-medium tracking-tight">
                {messages.nav.properties}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatMessage(messages.largestProperties, {
                  count: format.number(rows.length),
                })}
              </p>
            </div>
            <Button variant="outline" onClick={onViewAll}>
              {formatMessage(messages.viewAllProperties, {
                count: format.number(properties.length),
              })}
              <HugeiconsIcon icon={ArrowRightIcon} />
            </Button>
          </>
        ) : (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              {search
                ? formatMessage(messages.matchingProperties, {
                    count: format.number(rows.length),
                    total: format.number(properties.length),
                  })
                : formatMessage(messages.managedProperties, {
                    count: format.number(properties.length),
                  })}
            </p>
            <div className="relative w-full sm:w-64">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={messages.searchProperties}
                placeholder={messages.propertySearchPlaceholder}
                className="h-11 w-full rounded-(--radius-field) border border-input bg-card pr-3 pl-9 text-base placeholder:text-muted-foreground sm:h-9 sm:text-sm"
              />
            </div>
          </>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-border px-3.5 py-5 text-sm text-muted-foreground sm:px-6">
          {search ? messages.noMatchingProperties : messages.noProperties}
        </p>
      ) : (
        <table className="w-full rounded-(--radius-table) text-left text-sm">
          <thead className="border-y border-border bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3.5 py-2.5 font-medium sm:px-6">
                {messages.property}
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2.5 font-medium sm:table-cell"
              >
                {messages.units}
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2.5 text-right font-medium sm:table-cell"
              >
                {messages.occupancy}
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2.5 font-medium whitespace-nowrap sm:table-cell"
              >
                {messages.activeRequests}
              </th>
              <th scope="col" className="pr-3 sm:pr-5">
                <span className="sr-only">{messages.details}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((property) => {
              const occupancy = property.occupied / property.units
              const openCount = openCounts.get(property.id) ?? 0
              return (
                <tr
                  key={property.id}
                  className="relative focus-within:bg-muted/50 hover:bg-muted/50"
                >
                  <th scope="row" className="px-3.5 py-3 font-normal sm:px-6">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-muted-foreground"
                      >
                        <HugeiconsIcon icon={Building03Icon} size={18} />
                      </span>
                      <div className="min-w-0 wrap-anywhere">
                        <button
                          type="button"
                          className="text-left font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                          onClick={() => onProperty(property)}
                        >
                          {property.name}
                        </button>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {property.address}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                          {formatMessage(messages.propertyActivity, {
                            occupied: format.number(property.occupied),
                            total: format.number(property.units),
                            requests: formatMessage(
                              openCount === 1
                                ? messages.oneOpenRequest
                                : messages.openRequestCount,
                              { count: format.number(openCount) }
                            ),
                          })}
                        </p>
                      </div>
                    </div>
                  </th>
                  <td className="hidden px-3 tabular-nums sm:table-cell">
                    {format.number(property.units)}
                  </td>
                  <td className="hidden px-3 text-right tabular-nums whitespace-nowrap sm:table-cell">
                    {format.percent(occupancy)}
                    <span className="block text-xs text-muted-foreground">
                      {formatMessage(messages.vacancyCount, {
                        count: format.number(
                          property.units - property.occupied
                        ),
                      })}
                    </span>
                  </td>
                  <td className="hidden px-3 tabular-nums sm:table-cell">
                    {format.number(openCount)}
                  </td>
                  <td className="w-9 pr-3.5 sm:pr-6">
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={16}
                      aria-hidden="true"
                      className="text-muted-foreground"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function PropertySummary({ property }: { property: Property }) {
  const { messages, format } = useDashboardLocale()
  return (
    <dl className="mt-5 grid grid-cols-3 divide-x divide-border rounded-(--radius-card) border border-border bg-muted/50 text-center">
      {[
        { label: messages.units, value: property.units },
        { label: messages.occupied, value: property.occupied },
        { label: messages.vacant, value: property.units - property.occupied },
      ].map(({ label, value }) => (
        <div key={label} className="px-2 py-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-xl font-medium tabular-nums">
            {format.number(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

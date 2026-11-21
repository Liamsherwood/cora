import {
  ArrowRight01Icon,
  ArrowRightIcon,
  Building03Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"

import { activeRequests, type Property, type Request } from "./data"
import { formatMessage, useDashboardLocale } from "./locale"
import { useProperties } from "./portfolio"

export function PropertyList({
  requests,
  onProperty,
  onViewAll,
  limit,
}: {
  requests: Request[]
  onProperty: (property: Property) => void
  onViewAll?: () => void
  /** Show only the first rows (the largest properties). */
  limit?: number
}) {
  const { messages, format } = useDashboardLocale()
  const properties = useProperties()
  const rows = limit ? properties.slice(0, limit) : properties
  const open = activeRequests(requests)

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
      <div className="flex min-h-[76px] items-center justify-between gap-3 px-5 sm:px-6">
        <div>
          <h2 className="text-base font-medium tracking-tight">
            {messages.nav.properties}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMessage(messages.managedProperties, {
              count: format.number(properties.length),
            })}
          </p>
        </div>
        {onViewAll && (
          <Button variant="outline" onClick={onViewAll}>
            {messages.viewProperties} <HugeiconsIcon icon={ArrowRightIcon} />
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
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
              <th scope="col" className="px-3 py-2.5 font-medium">
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
              const openCount = open.filter(
                ({ propertyId }) => propertyId === property.id
              ).length
              return (
                <tr key={property.id} className="hover:bg-muted/50">
                  <th scope="row" className="px-3.5 py-3 font-normal sm:px-6">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                      >
                        <HugeiconsIcon icon={Building03Icon} size={18} />
                      </span>
                      <div>
                        <button
                          type="button"
                          className="rounded-sm text-left font-medium hover:underline"
                          onClick={() => onProperty(property)}
                        >
                          {property.name}
                        </button>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {property.address}
                        </p>
                      </div>
                    </div>
                  </th>
                  <td className="hidden px-3 tabular-nums sm:table-cell">
                    {format.number(property.units)}
                  </td>
                  <td className="px-3">
                    <div className="flex items-center gap-2.5 tabular-nums">
                      <span
                        aria-hidden="true"
                        className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-secondary lg:block"
                      >
                        <span
                          className="block h-full rounded-full bg-accent-foreground"
                          style={{ width: `${occupancy * 100}%` }}
                        />
                      </span>
                      {format.percent(occupancy)}
                    </div>
                  </td>
                  <td className="hidden px-3 tabular-nums sm:table-cell">
                    {format.number(openCount)}
                  </td>
                  <td className="w-10 pr-3 sm:pr-5">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={formatMessage(messages.viewProperty, {
                        name: property.name,
                      })}
                      onClick={() => onProperty(property)}
                    >
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        className="text-muted-foreground"
                      />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function PropertySummary({ property }: { property: Property }) {
  const { messages, format } = useDashboardLocale()
  return (
    <dl className="mt-5 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-muted/50 text-center">
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

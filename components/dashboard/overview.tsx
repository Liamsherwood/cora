import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  Building03Icon,
  Money03Icon,
  UserMultiple02Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"

import {
  activeRequests,
  attentionRequests,
  type Property,
  type Request,
} from "./data"
import { formatMessage, useDashboardLocale } from "./locale"
import { useProperties } from "./portfolio"
import { PropertyList } from "./property-list"
import { RentChart } from "./rent-chart"
import type { RentPeriod } from "./rent-history"
import { RequestList } from "./request-list"

export function Overview({
  month,
  rentHistory,
  requests,
  onProperty,
  onRequest,
  onProperties,
  onAttention,
}: {
  month: number
  rentHistory: RentPeriod[]
  requests: Request[]
  onProperty: (property: Property) => void
  onRequest: (request: Request) => void
  onProperties: () => void
  onAttention: () => void
}) {
  const { messages, format } = useDashboardLocale()
  const properties = useProperties()
  const units = properties.reduce((sum, property) => sum + property.units, 0)
  const occupied = properties.reduce(
    (sum, property) => sum + property.occupied,
    0
  )
  const rent = rentHistory[month]
  const change = rent.collected / rentHistory[month - 1].collected - 1
  const open = activeRequests(requests)
  const urgent = open.filter(({ priority }) => priority === "Urgent").length
  const attention = attentionRequests(requests)
  const metrics = [
    {
      label: messages.nav.properties,
      value: format.number(properties.length),
      detail: formatMessage(messages.managedUnits, {
        count: format.number(units),
      }),
      icon: Building03Icon,
    },
    {
      label: messages.occupancy,
      value: format.precisePercent(units ? occupied / units : 0),
      detail: formatMessage(messages.occupiedUnits, {
        occupied: format.number(occupied),
        total: format.number(units),
      }),
      icon: UserMultiple02Icon,
    },
    {
      label: messages.rentCollected,
      value: format.currency(rent.collected),
      detail: (
        <>
          <span className="inline-flex items-center gap-0.5 font-medium text-success">
            <HugeiconsIcon icon={ArrowUpRightIcon} size={13} />{" "}
            {format.precisePercent(change)}
          </span>
          <span>{messages.previousMonth}</span>
        </>
      ),
      icon: Money03Icon,
    },
    {
      label: messages.activeRequests,
      value: format.number(open.length),
      detail: urgent ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
          <span className="size-1.5 rounded-full bg-destructive" />
          {formatMessage(messages.urgentCount, {
            count: format.number(urgent),
          })}
        </span>
      ) : (
        messages.noUrgentRequests
      ),
      icon: Wrench01Icon,
    },
  ]

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {metrics.map(({ label, value, detail, icon }) => (
          <div
            key={label}
            className="relative min-w-0 rounded-2xl border border-border bg-card px-4 py-4 shadow-panel sm:px-5"
          >
            <dt className="flex min-h-9 items-center justify-between gap-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
              {label}
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground sm:size-9">
                <HugeiconsIcon icon={icon} size={17} />
              </span>
            </dt>
            <dd className="mt-2.5 text-[25px] leading-none font-medium tracking-tight tabular-nums xl:text-[32px]">
              {value}
            </dd>
            <dd className="mt-2.5 flex flex-wrap items-center gap-x-1 text-xs leading-4 text-muted-foreground">
              {detail}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <RentChart month={month} rentHistory={rentHistory} />
        <section className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-panel sm:p-6">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-medium tracking-tight">
                {messages.needsAttention}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {messages.attentionDescription}
              </p>
            </div>
            <span className="grid min-w-6 place-items-center rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {format.number(attention.length)}
            </span>
          </div>
          <RequestList requests={attention.slice(0, 3)} onRequest={onRequest} />
          <div className="mt-auto border-t border-border pt-3">
            <Button
              variant="ghost"
              className="-ml-2 h-auto min-h-9 max-w-full px-2 py-1.5 text-left whitespace-normal text-accent-foreground"
              onClick={onAttention}
            >
              {messages.viewAttentionQueue}{" "}
              <HugeiconsIcon icon={ArrowRightIcon} />
            </Button>
          </div>
        </section>
      </div>
      <PropertyList
        requests={requests}
        onProperty={onProperty}
        onViewAll={onProperties}
        limit={6}
      />
    </div>
  )
}

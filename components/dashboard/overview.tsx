import {
  ArrowDownRightIcon,
  ArrowRight01Icon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import {
  activeRequests,
  attentionRequests,
  urgentRequests,
  type Property,
  type Request,
} from "./data"
import { formatMessage, useDashboardLocale } from "./locale"
import { useProperties } from "./portfolio"
import { PropertyList } from "./property-list"
import { RentChart } from "./rent-chart"
import type { RentPeriod } from "./rent-history"
import { RequestList } from "./request-list"
import { MonthPicker } from "./workspace"

export function Overview({
  month,
  onMonth,
  rentHistory,
  requests,
  onProperty,
  onRequest,
  onProperties,
  onRent,
  onUrgent,
  onAttention,
}: {
  month: number
  onMonth: (month: number) => void
  rentHistory: RentPeriod[]
  requests: Request[]
  onProperty: (property: Property) => void
  onRequest: (request: Request) => void
  onProperties: (vacanciesOnly?: boolean) => void
  onRent: () => void
  onUrgent: () => void
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
  const previous = rentHistory[month - 1]?.collected
  const change = previous ? (rent.collected - previous) / previous : null
  const direction =
    change !== null && Math.abs(change) >= 0.0005 ? Math.sign(change) : 0
  const open = activeRequests(requests)
  const urgent = urgentRequests(requests).length
  const attention = attentionRequests(requests)
  const metrics = [
    {
      label: messages.nav.properties,
      value: format.number(properties.length),
      detail: formatMessage(messages.managedUnits, {
        count: format.number(units),
      }),
      onClick: () => onProperties(),
    },
    {
      label: messages.occupancy,
      value: format.precisePercent(units ? occupied / units : 0),
      detail: formatMessage(messages.vacancyCount, {
        count: format.number(units - occupied),
      }),
      onClick: () => onProperties(true),
    },
    {
      label: messages.simulatedCollections,
      value: format.currency(rent.collected),
      detail: change !== null && (
        <>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium whitespace-nowrap",
              direction > 0 && "text-success",
              direction < 0 && "text-destructive"
            )}
          >
            <HugeiconsIcon
              icon={
                direction > 0
                  ? ArrowUpRightIcon
                  : direction < 0
                    ? ArrowDownRightIcon
                    : MinusSignIcon
              }
              size={13}
              aria-hidden="true"
            />
            {format.percentChange(change)}
          </span>
          <span>{messages.previousMonth}</span>
        </>
      ),
      period: rent.shortMonthYear,
      mobileLayout: "wide",
      onClick: onRent,
    },
    {
      label: messages.urgentRequests,
      value: format.number(urgent),
      detail: formatMessage(messages.activeRequestCount, {
        count: format.number(open.length),
      }),
      highlight: urgent > 0,
      mobileLayout: "compact",
      onClick: onUrgent,
    },
  ]

  return (
    <div className="space-y-5">
      <ul className="grid list-none grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {metrics.map(
          ({
            label,
            value,
            detail,
            period,
            highlight,
            mobileLayout,
            onClick,
          }) => {
            const compact = mobileLayout === "compact"
            return (
              <li
                key={label}
                className={cn(
                  "min-w-0",
                  mobileLayout && "max-[400px]:col-span-2"
                )}
              >
                <button
                  type="button"
                  onClick={onClick}
                  className={cn(
                    "relative flex h-full w-full flex-col rounded-(--radius-card) border border-border bg-card px-4 py-4 text-left shadow-panel hover:bg-muted/60 active:bg-muted sm:px-5",
                    compact &&
                      "max-[400px]:grid max-[400px]:grid-cols-[minmax(0,1fr)_auto] max-[400px]:items-center max-[400px]:gap-x-3 max-[400px]:pr-10"
                  )}
                >
                  <span
                    className={cn(
                      "flex min-h-9 items-center pr-5 text-xs font-medium text-muted-foreground sm:text-sm",
                      compact && "max-[400px]:min-h-0 max-[400px]:pr-0"
                    )}
                  >
                    {label}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={16}
                    aria-hidden="true"
                    className={cn(
                      "absolute top-6 right-4 text-muted-foreground sm:right-5",
                      compact &&
                        "max-[400px]:top-1/2 max-[400px]:-translate-y-1/2"
                    )}
                  />
                  <span
                    className={cn(
                      "mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[25px] leading-none font-medium tabular-nums xl:text-[32px]",
                      compact &&
                        "max-[400px]:col-start-2 max-[400px]:row-span-2 max-[400px]:row-start-1 max-[400px]:mt-0",
                      highlight && "text-destructive"
                    )}
                  >
                    {value}
                    {period && (
                      <span className="text-xs/4 font-normal tracking-normal text-muted-foreground">
                        {period}
                      </span>
                    )}
                  </span>
                  {detail && (
                    <span
                      className={cn(
                        "mt-2.5 flex flex-wrap items-center gap-x-1 text-xs leading-4 text-muted-foreground",
                        compact && "max-[400px]:mt-1"
                      )}
                    >
                      {detail}
                    </span>
                  )}
                </button>
              </li>
            )
          }
        )}
      </ul>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="flex flex-col rounded-(--radius-card) border border-border bg-card p-5 shadow-panel sm:p-6 xl:col-start-2 xl:row-start-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-base font-medium tracking-tight">
              {messages.needsAttention}
            </h2>
            <span className="grid min-w-6 place-items-center rounded-(--radius-badge) bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
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
        <RentChart
          month={month}
          rentHistory={rentHistory}
          className="xl:col-start-1 xl:row-start-1"
          monthControl={
            <MonthPicker
              month={month}
              rentHistory={rentHistory}
              onMonth={onMonth}
            />
          }
        />
      </div>
      <PropertyList
        requests={requests}
        onProperty={onProperty}
        onViewAll={() => onProperties()}
      />
    </div>
  )
}

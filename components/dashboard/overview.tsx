import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  Building03Icon,
  MinusSignIcon,
  Money03Icon,
  UserMultiple02Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
import { MonthPicker } from "./workspace"

export function Overview({
  month,
  onMonth,
  rentHistory,
  requests,
  onProperty,
  onRequest,
  onProperties,
  onAttention,
}: {
  month: number
  onMonth: (month: number) => void
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
  const previous = rentHistory[month - 1]?.collected
  const change = previous ? (rent.collected - previous) / previous : null
  const direction =
    change !== null && Math.abs(change) >= 0.0005 ? Math.sign(change) : 0
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
      icon: Money03Icon,
      period: rent.shortMonthYear,
      mobileLayout: "wide",
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
      mobileLayout: "compact",
    },
  ]

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {metrics.map(({ label, value, detail, icon, period, mobileLayout }) => (
          <div
            key={label}
            className={cn(
              "min-w-0 rounded-(--radius-card) border border-border bg-card px-4 py-4 shadow-panel sm:px-5",
              mobileLayout && "max-[400px]:col-span-2",
              mobileLayout === "compact" &&
                "max-[400px]:grid max-[400px]:grid-cols-[minmax(0,1fr)_auto] max-[400px]:items-center max-[400px]:gap-x-3"
            )}
          >
            <dt
              className={cn(
                "flex min-h-9 items-center justify-between gap-1.5 text-xs font-medium text-muted-foreground sm:text-sm",
                mobileLayout === "compact" && "max-[400px]:min-h-0"
              )}
            >
              {label}
              <span
                className={cn(
                  "shrink-0 text-muted-foreground",
                  mobileLayout === "compact" && "max-[400px]:hidden"
                )}
              >
                <HugeiconsIcon icon={icon} size={17} />
              </span>
            </dt>
            <dd
              className={cn(
                "mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[25px] leading-none font-medium tabular-nums xl:text-[32px]",
                mobileLayout === "compact" &&
                  "max-[400px]:col-start-2 max-[400px]:row-span-2 max-[400px]:row-start-1 max-[400px]:mt-0"
              )}
            >
              {value}
              {period && (
                <span className="text-xs/4 font-normal tracking-normal text-muted-foreground">
                  {period}
                </span>
              )}
            </dd>
            <dd
              className={cn(
                "mt-2.5 flex flex-wrap items-center gap-x-1 text-xs leading-4 text-muted-foreground",
                mobileLayout === "compact" && "max-[400px]:mt-1"
              )}
            >
              {detail}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="flex flex-col rounded-(--radius-card) border border-border bg-card p-5 shadow-panel sm:p-6 xl:col-start-2 xl:row-start-1">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-medium tracking-tight">
                {messages.needsAttention}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {messages.attentionDescription}
              </p>
            </div>
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
        onViewAll={onProperties}
      />
    </div>
  )
}

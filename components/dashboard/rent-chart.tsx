import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { formatMessage, useDashboardLocale } from "./locale"
import type { RentPeriod } from "./rent-history"

/** Four gridlines (three steps) whose top line clears the largest amount shown. */
function chartAxis(max: number) {
  const rough = Math.max(max, 1) / 3
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step =
    [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((n) => n * magnitude >= rough)! *
    magnitude
  return [3, 2, 1, 0].map((n) => n * step)
}

export function RentChart({
  month,
  rentHistory,
  monthControl,
  className,
}: {
  month: number
  rentHistory: RentPeriod[]
  monthControl?: ReactNode
  className?: string
}) {
  const { messages, format } = useDashboardLocale()
  const history = rentHistory.slice(month - 5, month + 1)
  const axis = chartAxis(
    Math.max(...history.map((p) => Math.max(p.collected, p.expected)))
  )

  return (
    <figure
      className={cn(
        "rounded-(--radius-card) border border-border bg-card p-5 shadow-panel sm:p-6",
        className
      )}
    >
      <figcaption className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h2 className="text-base font-medium tracking-tight">
            {messages.simulatedCollections}
          </h2>
          {monthControl}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-chart-collected" />
            {messages.chartPayments}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-chart-target" />
            {messages.expected}
          </span>
        </div>
      </figcaption>
      <div className="grid h-44 grid-cols-[max-content_minmax(0,1fr)] gap-3 sm:h-48">
        <div
          className="flex flex-col justify-between text-xs leading-none tabular-nums whitespace-nowrap text-muted-foreground"
          aria-hidden="true"
        >
          {axis.map((amount) => (
            <span key={amount}>
              {amount
                ? formatMessage(messages.chartThousands, {
                    amount: format.number(amount / 1000),
                  })
                : format.currency(0)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 inset-y-1.5 flex flex-col justify-between"
          >
            {axis.map((amount) => (
              <span key={amount} className="h-px bg-chart-grid" />
            ))}
          </div>
          <ul className="absolute inset-x-0 inset-y-1.5 grid grid-cols-6 sm:gap-2">
            {history.map(
              (
                { month, shortMonth, longMonthYear, collected, expected },
                index
              ) => {
                const collectedAmount = format.currency(collected)
                const expectedAmount = format.currency(expected)
                const current = index === history.length - 1
                return (
                  <li key={month} className="relative flex justify-center">
                    <div
                      tabIndex={0}
                      aria-label={formatMessage(messages.chartBar, {
                        month: longMonthYear,
                        collected: collectedAmount,
                        expected: expectedAmount,
                      })}
                      role="img"
                      className="group absolute inset-0 rounded-md"
                    >
                      <div
                        aria-hidden="true"
                        className="absolute bottom-0 left-1/2 w-3/5 max-w-12 -translate-x-1/2 rounded-t-[4px] bg-chart-collected"
                        style={{ height: `${(collected / axis[0]) * 100}%` }}
                      />
                      <div
                        aria-hidden="true"
                        className="absolute left-1/2 h-0.5 w-4/5 max-w-15 -translate-x-1/2 translate-y-1/2 rounded-full bg-chart-target"
                        style={{ bottom: `${(expected / axis[0]) * 100}%` }}
                      />
                      <div
                        aria-hidden="true"
                        className={cn(
                          "pointer-events-none absolute z-10 hidden w-max rounded-(--radius-overlay) border border-border bg-popover px-3 py-2 text-xs shadow-float group-hover:block group-focus:block",
                          index < 2
                            ? "left-0"
                            : index > 3
                              ? "right-0"
                              : "left-1/2 -translate-x-1/2"
                        )}
                        style={{
                          bottom: `calc(${(Math.max(collected, expected) / axis[0]) * 100}% + 8px)`,
                        }}
                      >
                        <p className="font-medium">
                          {formatMessage(messages.chartCollected, {
                            amount: collectedAmount,
                          })}
                        </p>
                        <p className="mt-0.5 text-muted-foreground">
                          {formatMessage(messages.chartExpected, {
                            amount: expectedAmount,
                          })}
                        </p>
                      </div>
                    </div>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-full mt-2.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground",
                        current &&
                          "bg-accent font-medium text-accent-foreground"
                      )}
                    >
                      {shortMonth}
                    </span>
                  </li>
                )
              }
            )}
          </ul>
        </div>
      </div>
      <div className="h-7" />
    </figure>
  )
}

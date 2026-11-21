import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

import { CoraChip, useWithCora } from "./cora-dispatch"
import type { Request } from "./data"
import { useDashboardLocale } from "./locale"
import { useProperties } from "./portfolio"

const badgeColors = {
  Open: "bg-muted text-muted-foreground",
  Scheduled: "bg-info-surface text-info",
  "Awaiting vendor": "bg-warning-surface text-warning",
  Resolved: "bg-success-surface text-success",
}

export function RequestBadge({ request }: { request: Request }) {
  const { messages } = useDashboardLocale()
  return (
    <span
      className={cn(
        "inline-block rounded-(--radius-badge) px-2 py-1 text-xs font-medium",
        badgeColors[request.status]
      )}
    >
      {messages.status[request.status]}
    </span>
  )
}

function RequestStatus({ request }: { request: Request }) {
  return useWithCora(request) ? (
    <CoraChip />
  ) : (
    <RequestBadge request={request} />
  )
}

export function RequestList({
  requests,
  onRequest,
  emptyMessage,
}: {
  requests: Request[]
  onRequest: (request: Request) => void
  emptyMessage?: string
}) {
  const { messages } = useDashboardLocale()
  const properties = useProperties()
  if (requests.length === 0) {
    return (
      <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          size={18}
          className="text-success"
        />
        {emptyMessage ?? messages.noRequests}
      </div>
    )
  }

  return (
    <ul className="@container divide-y divide-border">
      {requests.map((request) => {
        const property = properties.find(({ id }) => id === request.propertyId)
        const urgent =
          request.priority === "Urgent" && request.status !== "Resolved"
        const waiting = request.status === "Awaiting vendor"
        return (
          <li key={request.id}>
            <button
              type="button"
              className="grid w-full grid-cols-[17px_minmax(0,1fr)_14px] items-start gap-x-3 gap-y-1.5 rounded-md py-3 text-left hover:bg-muted/60 @xs:grid-cols-[17px_minmax(0,1fr)_auto_14px] @xs:items-center"
              data-request-id={request.id}
              onClick={() => onRequest(request)}
            >
              <span
                className={cn(
                  "mt-0.5 @xs:mt-0",
                  urgent
                    ? "text-destructive"
                    : waiting
                      ? "text-warning"
                      : "text-muted-foreground"
                )}
              >
                <HugeiconsIcon
                  icon={
                    urgent ? Alert02Icon : waiting ? Clock01Icon : Wrench01Icon
                  }
                  size={17}
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium wrap-anywhere">
                  {request.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {property?.name}
                </span>
              </span>
              <span className="col-start-2 row-start-2 flex flex-wrap items-center gap-1.5 @xs:col-start-3 @xs:row-start-1 @xs:max-w-32 @xs:justify-end @xs:text-right">
                <RequestStatus request={request} />
                {urgent && (
                  <span className="rounded-(--radius-badge) bg-destructive-surface px-2 py-1 text-xs font-medium text-destructive">
                    {messages.priority.Urgent}
                  </span>
                )}
              </span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                aria-hidden="true"
                className="col-start-3 row-start-1 mt-0.5 text-muted-foreground @xs:col-start-4 @xs:mt-0"
              />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

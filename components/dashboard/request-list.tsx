import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

import { properties, type Request } from "./data"
import { useDashboardLocale } from "./locale"

const badgeColors = {
  Open: "bg-muted text-muted-foreground",
  Scheduled: "bg-info-surface text-info",
  "Awaiting vendor": "bg-warning-surface text-warning",
  Resolved: "bg-success-surface text-success",
  Urgent: "bg-destructive-surface text-destructive",
}

export function RequestBadge({ request }: { request: Request }) {
  const { messages } = useDashboardLocale()
  const label =
    request.priority === "Urgent" && request.status !== "Resolved"
      ? "Urgent"
      : request.status

  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-1 text-xs font-medium",
        badgeColors[label]
      )}
    >
      {label === "Urgent" ? messages.priority.Urgent : messages.status[label]}
    </span>
  )
}

export function RequestList({
  requests,
  onRequest,
}: {
  requests: Request[]
  onRequest: (request: Request) => void
}) {
  const { messages } = useDashboardLocale()
  if (requests.length === 0) {
    return (
      <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          size={18}
          className="text-success"
        />
        {messages.noRequests}
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {requests.map((request) => {
        const property = properties.find(({ id }) => id === request.propertyId)
        const urgent =
          request.priority === "Urgent" && request.status !== "Resolved"
        const waiting = request.status === "Awaiting vendor"
        return (
          <li key={request.id}>
            <button
              type="button"
              className="group flex w-full items-center gap-3 rounded-md py-3 text-left hover:bg-muted/60"
              onClick={() => onRequest(request)}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg",
                  urgent
                    ? "bg-destructive-surface text-destructive"
                    : waiting
                      ? "bg-warning-surface text-warning"
                      : "bg-muted text-muted-foreground"
                )}
              >
                <HugeiconsIcon
                  icon={
                    urgent ? Alert02Icon : waiting ? Clock01Icon : Wrench01Icon
                  }
                  size={17}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {request.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {property?.name}
                </span>
              </span>
              <span className="max-w-28 shrink-0 text-right sm:max-w-none">
                <RequestBadge request={request} />
              </span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                className="mr-0.5 shrink-0 text-muted-foreground"
              />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

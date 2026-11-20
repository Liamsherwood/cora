"use client"

import {
  Add01Icon,
  CheckmarkCircle02Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

import {
  activeRequests,
  attentionRequests,
  properties,
  type Property,
  type Request,
} from "./data"
import { NewRequestDialog, SearchDialog } from "./dialogs"
import { formatMessage, useDashboardLocale } from "./locale"
import { Overview } from "./overview"
import { PropertyList, PropertySummary } from "./property-list"
import { RentChart } from "./rent-chart"
import type { RentPeriod } from "./rent-history"
import { RequestBadge, RequestList } from "./request-list"
import { updateRequests, useRequests } from "./request-store"
import { MonthPicker, Sidebar, WorkspaceHeader, type View } from "./workspace"

type Overlay =
  | { type: "search" | "new" | "attention" }
  | { type: "property"; property: Property }
  | { type: "request"; request: Request }

type RequestFilter = "active" | "attention" | "resolved"

export function Dashboard({ rentHistory }: { rentHistory: RentPeriod[] }) {
  const { locale, messages, format } = useDashboardLocale()
  const [view, setView] = useState<View>("overview")
  const [month, setMonth] = useState(rentHistory.length - 1)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const dialogPopup = useRef<HTMLDivElement>(null)
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("active")
  const [announcement, setAnnouncement] = useState("")
  const requests = useRequests()
  const attention = attentionRequests(requests)
  const active = activeRequests(requests)
  const requestGroups = {
    active: { label: messages.active, requests: active },
    attention: { label: messages.needsAttention, requests: attention },
    resolved: {
      label: messages.status.Resolved,
      requests: requests.filter(({ status }) => status === "Resolved"),
    },
  }
  const { title, description } = messages.headings[view]
  const rent = rentHistory[month]
  const rentTotals = [
    { label: messages.collected, amount: rent.collected },
    { label: messages.expected, amount: rent.expected },
    { label: messages.outstanding, amount: rent.expected - rent.collected },
  ]
  const selectedRequest =
    overlay?.type === "request"
      ? (requests.find(({ id }) => id === overlay.request.id) ??
        overlay.request)
      : undefined

  useEffect(() => {
    function searchShortcut(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.shiftKey
      )
        return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        if (!dialogOpen) {
          setOverlay({ type: "search" })
          setDialogOpen(true)
        }
      }
    }

    window.addEventListener("keydown", searchShortcut)
    return () => window.removeEventListener("keydown", searchShortcut)
  }, [dialogOpen])

  function changeView(next: View) {
    setView(next)
    window.scrollTo({ top: 0 })
  }

  function openOverlay(next: Overlay) {
    setOverlay(next)
    setDialogOpen(true)
  }

  function openProperty(property: Property) {
    openOverlay({ type: "property", property })
  }

  function openRequest(request: Request) {
    openOverlay({ type: "request", request })
  }

  function createRequest(request: Request) {
    updateRequests((current) => [request, ...current])
    setDialogOpen(false)
    setRequestFilter("active")
    changeView("maintenance")
    setAnnouncement(
      formatMessage(messages.requestCreated, { title: request.title })
    )
  }

  function changeRequestStatus(request: Request, status: "Open" | "Resolved") {
    updateRequests((current) =>
      current.map((item) =>
        item.id === request.id ? { ...item, status } : item
      )
    )
    setDialogOpen(false)
    if (status === "Open" && view === "maintenance") {
      setRequestFilter("active")
    }
    setAnnouncement(
      formatMessage(
        status === "Resolved"
          ? messages.requestResolved
          : messages.requestReopened,
        { title: request.title }
      )
    )
  }

  return (
    <div className="flex min-h-svh">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {messages.skipToContent}
      </a>
      <Sidebar view={view} onView={changeView} />
      <div className="min-w-0 flex-1">
        <WorkspaceHeader
          view={view}
          onView={changeView}
          onSearch={() => openOverlay({ type: "search" })}
          onAttention={() => openOverlay({ type: "attention" })}
          attentionCount={attention.length}
        />
        <main
          id="main-content"
          className="mx-auto max-w-[1460px] px-4 pt-7 pb-10 sm:px-8 sm:pt-9"
        >
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-7">
            <div>
              <h1 className="text-[30px] leading-[1.1] font-medium tracking-[-0.045em] sm:text-[38px]">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-5 text-muted-foreground sm:text-[15px]">
                {description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {(view === "overview" || view === "rent") && (
                <MonthPicker
                  month={month}
                  rentHistory={rentHistory}
                  onMonth={setMonth}
                />
              )}
              {(view === "overview" || view === "maintenance") && (
                <Button size="lg" onClick={() => openOverlay({ type: "new" })}>
                  <HugeiconsIcon icon={Add01Icon} /> {messages.newRequest}
                </Button>
              )}
            </div>
          </div>

          {view === "overview" && (
            <Overview
              month={month}
              rentHistory={rentHistory}
              requests={requests}
              onProperty={openProperty}
              onRequest={openRequest}
              onProperties={() => changeView("properties")}
              onAttention={() => {
                setRequestFilter("attention")
                changeView("maintenance")
              }}
            />
          )}
          {view === "properties" && (
            <PropertyList requests={requests} onProperty={openProperty} />
          )}
          {view === "maintenance" && (
            <section className="rounded-2xl border border-border bg-card px-5 py-4 shadow-panel sm:px-6">
              <div
                className="mb-2 flex flex-wrap gap-1.5 border-b border-border pb-4"
                role="group"
                aria-label={messages.filterRequests}
              >
                {(["active", "attention", "resolved"] as const).map(
                  (filter) => (
                    <Button
                      key={filter}
                      variant={requestFilter === filter ? "secondary" : "ghost"}
                      aria-pressed={requestFilter === filter}
                      onClick={() => setRequestFilter(filter)}
                    >
                      {requestGroups[filter].label}{" "}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format.number(requestGroups[filter].requests.length)}
                      </span>
                    </Button>
                  )
                )}
              </div>
              <RequestList
                requests={requestGroups[requestFilter].requests}
                onRequest={openRequest}
              />
            </section>
          )}
          {view === "rent" && (
            <div className="space-y-5">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                {rentTotals.map(({ label, amount }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-border bg-card p-4 shadow-panel sm:p-5"
                  >
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="mt-2 text-2xl font-medium tracking-tight tabular-nums">
                      {format.currency(amount)}
                    </dd>
                  </div>
                ))}
              </dl>
              <RentChart month={month} rentHistory={rentHistory} />
            </div>
          )}
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </main>
        <footer className="mx-auto max-w-[1460px] px-4 pb-6 text-sm text-muted-foreground sm:px-8">
          <Link
            href={`/${locale}/privacy`}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {messages.privacyPolicy}
          </Link>
        </footer>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          closeLabel={messages.closeDialog}
          ref={dialogPopup}
          initialFocus={() =>
            dialogPopup.current?.querySelector<HTMLElement>(
              "[data-initial-focus]"
            ) ?? dialogPopup.current
          }
        >
          {overlay?.type === "new" && (
            <NewRequestDialog onCreate={createRequest} />
          )}
          {overlay?.type === "search" && (
            <SearchDialog
              requests={requests}
              onProperty={openProperty}
              onRequest={openRequest}
            />
          )}
          {overlay?.type === "attention" && (
            <>
              <DialogTitle className="pr-8 text-xl font-medium tracking-tight">
                {messages.needsAttention}
              </DialogTitle>
              <DialogDescription className="mt-1.5 mb-2 text-sm text-muted-foreground">
                {messages.attentionDescription}
              </DialogDescription>
              <div className="max-h-[55svh] overflow-y-auto p-0.5">
                <RequestList requests={attention} onRequest={openRequest} />
              </div>
            </>
          )}
          {overlay?.type === "property" && (
            <>
              <DialogTitle className="pr-8 text-xl font-medium tracking-tight">
                {overlay.property.name}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                {overlay.property.address}
              </DialogDescription>
              <PropertySummary property={overlay.property} />
              <h3 className="mt-5 text-sm font-medium">
                {messages.activeRequests}
              </h3>
              <div className="max-h-[38svh] overflow-y-auto p-0.5">
                <RequestList
                  requests={active.filter(
                    ({ propertyId }) => propertyId === overlay.property.id
                  )}
                  onRequest={openRequest}
                />
              </div>
            </>
          )}
          {selectedRequest && (
            <>
              <DialogTitle className="pr-8 text-xl font-medium tracking-tight wrap-break-word">
                {selectedRequest.title}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                {
                  properties.find(({ id }) => id === selectedRequest.propertyId)
                    ?.name
                }
              </DialogDescription>
              <div className="mt-4 flex items-center gap-2">
                <RequestBadge request={selectedRequest} />
                <span className="text-xs text-muted-foreground">
                  {selectedRequest.priority === "Urgent" &&
                  selectedRequest.status !== "Resolved"
                    ? messages.status[selectedRequest.status]
                    : formatMessage(messages.requestPriority, {
                        priority: messages.priority[selectedRequest.priority],
                      })}
                </span>
              </div>
              {selectedRequest.description && (
                <p className="mt-4 text-sm leading-6 wrap-break-word whitespace-pre-wrap">
                  {selectedRequest.description}
                </p>
              )}
              <div className="mt-6 flex justify-end">
                {selectedRequest.status === "Resolved" ? (
                  <Button
                    variant="outline"
                    onClick={() => changeRequestStatus(selectedRequest, "Open")}
                  >
                    <HugeiconsIcon icon={RefreshIcon} />{" "}
                    {messages.reopenRequest}
                  </Button>
                ) : (
                  <Button
                    onClick={() =>
                      changeRequestStatus(selectedRequest, "Resolved")
                    }
                  >
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} />{" "}
                    {messages.markResolved}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

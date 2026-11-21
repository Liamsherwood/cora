"use client"

import {
  Add01Icon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

import {
  activeRequests,
  attentionRequests,
  type Property,
  type Request,
} from "./data"
import { NewRequestDialog, SearchDialog } from "./dialogs"
import { formatMessage, useDashboardLocale } from "./locale"
import { Overview } from "./overview"
import { useProperties } from "./portfolio"
import { PropertyList, PropertySummary } from "./property-list"
import { RentChart } from "./rent-chart"
import type { RentPeriod } from "./rent-history"
import { RequestBadge, RequestList } from "./request-list"
import { updateRequests, useRequests } from "./request-store"
import { MonthPicker, WorkspaceShell, type View } from "./workspace"

type Overlay =
  | { type: "search" | "new" | "attention" }
  | { type: "property"; property: Property; returnRequestId?: string }
  | { type: "request"; request: Request; property?: Property }

type RequestFilter = "active" | "attention" | "resolved"

export function Dashboard({
  rentHistory,
  initialView = "overview",
}: {
  rentHistory: RentPeriod[]
  /** From `?view=`, so other workspace pages can link to a dashboard view. */
  initialView?: View
}) {
  const { messages, format } = useDashboardLocale()
  const [view, setView] = useState<View>(initialView)
  const [month, setMonth] = useState(rentHistory.length - 1)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const dialogPopup = useRef<HTMLDivElement>(null)
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("active")
  const [announcement, setAnnouncement] = useState("")
  const requests = useRequests()
  const properties = useProperties()
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
  const heading = messages.headings[view]
  const rent = rentHistory[month]
  const rentTotals = [
    { label: messages.simulatedCollections, amount: rent.collected },
    { label: messages.expected, amount: rent.expected },
    {
      label: messages.projectedShortfall,
      amount: rent.expected - rent.collected,
    },
  ]
  const selectedRequest =
    overlay?.type === "request"
      ? (requests.find(({ id }) => id === overlay.request.id) ??
        overlay.request)
      : undefined
  const requestProperty =
    overlay?.type === "request" ? overlay.property : undefined

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

  useLayoutEffect(() => {
    if (!dialogOpen || !dialogPopup.current) return
    if (overlay?.type !== "property" && overlay?.type !== "request") return

    const requestButton =
      overlay.type === "property" && overlay.returnRequestId
        ? dialogPopup.current.querySelector<HTMLButtonElement>(
            `[data-request-id="${CSS.escape(overlay.returnRequestId)}"]`
          )
        : null
    const target =
      requestButton ??
      dialogPopup.current.querySelector<HTMLElement>("[data-initial-focus]")
    target?.focus()
  }, [dialogOpen, overlay])

  function changeView(next: View) {
    setView(next)
    // Keep the URL in step so a reload or shared link lands on the same view.
    const url = new URL(window.location.href)
    if (next === "overview") url.searchParams.delete("view")
    else url.searchParams.set("view", next)
    window.history.replaceState(window.history.state, "", url)
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

  function returnToProperty(property: Property, request: Request) {
    setOverlay({ type: "property", property, returnRequestId: request.id })
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
    if (requestProperty) {
      returnToProperty(requestProperty, request)
    } else {
      setDialogOpen(false)
      if (status === "Open" && view === "maintenance") {
        setRequestFilter("active")
      }
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

  const showNewRequest = view === "overview" || view === "maintenance"

  return (
    <WorkspaceShell
      current={view}
      onView={changeView}
      onSearch={() => openOverlay({ type: "search" })}
      onAttention={() => openOverlay({ type: "attention" })}
      attentionCount={attention.length}
      title={heading.title}
      description={"description" in heading ? heading.description : undefined}
      actions={
        showNewRequest ? (
          <Button size="lg" onClick={() => openOverlay({ type: "new" })}>
            <HugeiconsIcon icon={Add01Icon} /> {messages.newRequest}
          </Button>
        ) : undefined
      }
    >
      {view === "overview" && (
        <Overview
          month={month}
          onMonth={setMonth}
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
        <section className="rounded-(--radius-card) border border-border bg-card px-5 py-4 shadow-panel sm:px-6">
          <div
            className="mb-2 flex flex-wrap gap-1.5 border-b border-border pb-4"
            role="group"
            aria-label={messages.filterRequests}
          >
            {(["active", "attention", "resolved"] as const).map((filter) => (
              <Button
                key={filter}
                variant={requestFilter === filter ? "secondary" : "ghost"}
                className="rounded-(--radius-chip)"
                aria-pressed={requestFilter === filter}
                onClick={() => setRequestFilter(filter)}
              >
                <span className="flex items-baseline gap-1.5">
                  {requestGroups[filter].label}
                  <span className="text-xs font-normal tabular-nums text-muted-foreground">
                    {format.number(requestGroups[filter].requests.length)}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          <RequestList
            requests={requestGroups[requestFilter].requests}
            onRequest={openRequest}
          />
        </section>
      )}
      {view === "rent" && (
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex sm:justify-end">
              <MonthPicker
                month={month}
                rentHistory={rentHistory}
                onMonth={setMonth}
              />
            </div>
            <dl className="grid gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3 sm:gap-4">
              {rentTotals.map(({ label, amount }) => (
                <div
                  key={label}
                  className="rounded-(--radius-card) border border-border bg-card p-4 shadow-panel min-[400px]:first:col-span-2 sm:first:col-span-1 lg:p-5"
                >
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="mt-2 text-2xl font-medium tabular-nums">
                    {format.currency(amount)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <RentChart month={month} rentHistory={rentHistory} />
        </div>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>

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
              <DialogTitle
                tabIndex={-1}
                data-initial-focus
                className="pr-8 text-xl font-medium tracking-tight focus:outline-none"
              >
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
                  onRequest={(request) =>
                    openOverlay({
                      type: "request",
                      request,
                      property: overlay.property,
                    })
                  }
                />
              </div>
            </>
          )}
          {overlay?.type === "request" && selectedRequest && (
            <>
              <DialogTitle
                tabIndex={-1}
                data-initial-focus
                className="pr-8 text-xl font-medium tracking-tight wrap-break-word focus:outline-none"
              >
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
                <span
                  className={cn(
                    "text-xs text-muted-foreground",
                    selectedRequest.priority === "Urgent" &&
                      selectedRequest.status !== "Resolved" &&
                      "font-medium text-destructive"
                  )}
                >
                  {formatMessage(messages.requestPriority, {
                    priority: messages.priority[selectedRequest.priority],
                  })}
                </span>
              </div>
              {selectedRequest.description && (
                <p className="mt-4 text-sm leading-6 wrap-break-word whitespace-pre-wrap">
                  {selectedRequest.description}
                </p>
              )}
              <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                {requestProperty && (
                  <Button
                    variant="ghost"
                    className="mr-auto -ml-2.5 px-2.5 text-muted-foreground"
                    onClick={() =>
                      returnToProperty(requestProperty, selectedRequest)
                    }
                  >
                    <HugeiconsIcon icon={ArrowLeft01Icon} />
                    {messages.backToProperty}
                  </Button>
                )}
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
    </WorkspaceShell>
  )
}

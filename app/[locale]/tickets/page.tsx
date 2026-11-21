import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DashboardLocaleProvider } from "@/components/dashboard/locale"
import { WorkspaceShell } from "@/components/dashboard/workspace"
import { AutoRefresh } from "@/components/partner-connect/auto-refresh"
import { ActivityOrb } from "@/components/tickets/activity-orb"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { getDb } from "@/lib/db"
import { isUuid } from "@/lib/ids"
import { getMessages, type Messages } from "@/lib/i18n/dictionaries"
import { isLocale, localeSettings } from "@/lib/i18n/locales"
import { hasTicketAccess, isStaffTicketInbox } from "@/lib/tickets/access"
import { listTicketActivity } from "@/lib/tickets/activity"
import { demoTicket, demoTicketRuns } from "@/lib/tickets/demo"
import {
  getTicket,
  listTicketRuns,
  listTickets,
  ticketPageSize,
} from "@/lib/tickets/repository"
import { listTicketTenancies } from "@/lib/tickets/tenancies"
import { assignTicketTenancy, markTicketResolved } from "./actions"
import styles from "./run-details.module.css"

export const metadata: Metadata = {
  title: "Tickets · Cora",
  robots: { index: false, follow: false },
}

function TicketStatus({
  resolved,
  messages,
}: {
  resolved: boolean
  messages: Messages["tickets"]
}) {
  return (
    <Badge
      className={
        resolved
          ? "bg-success-surface text-success"
          : "bg-info-surface text-info"
      }
    >
      {resolved ? messages.resolved : messages.open}
    </Badge>
  )
}

export default async function TicketsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/tickets">) {
  const [{ locale }, query] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const { tickets: messages, dashboard } = await getMessages(locale)
  const staffInbox = isStaffTicketInbox()
  if (staffInbox && !hasTicketAccess((await headers()).get("authorization")))
    notFound()

  const page =
    staffInbox &&
    typeof query.page === "string" &&
    /^[1-9]\d{0,6}$/.test(query.page)
      ? Number(query.page)
      : 1
  const db = staffInbox ? getDb() : null
  const [rows, requestedTicket, activity] = db
    ? await Promise.all([
        listTickets(db, page),
        isUuid(query.ticket) ? getTicket(db, query.ticket) : null,
        listTicketActivity(db),
      ])
    : [[demoTicket(messages.demoSummary, query.resolved === "1")], null, []]
  const visibleTickets = rows.slice(0, ticketPageSize)
  const ticket = requestedTicket ?? visibleTickets[0]
  const activityByTicket = new Map(activity.map((run) => [run.ticketId, run]))
  const ticketActivity = ticket && activityByTicket.get(ticket.id)
  const [runs, tenancies] =
    db && ticket
      ? await Promise.all([
          listTicketRuns(db, ticket.id),
          ticket.caseId ? [] : listTicketTenancies(db),
        ])
      : [staffInbox ? [] : demoTicketRuns, []]
  const date = new Intl.DateTimeFormat(localeSettings[locale].intlLocale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Berlin",
  })
  const pageUrl = `/${locale}/tickets`

  return (
    <DashboardLocaleProvider locale={locale} messages={dashboard}>
      <WorkspaceShell
        current="tickets"
        title={messages.title}
        description={
          staffInbox ? messages.description : messages.demoDescription
        }
      >
        {staffInbox ? <AutoRefresh /> : null}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)] lg:items-start">
          <section
            aria-labelledby="ticket-list"
            className="rounded-(--radius-card) border border-border bg-card"
          >
            <h2
              id="ticket-list"
              className="border-b border-border px-5 py-4 text-sm font-medium"
            >
              {messages.inbox}
            </h2>
            <div role="status">
              {activityByTicket.has(null) ? (
                <div className="flex items-center gap-2 border-b border-border bg-info-surface px-5 py-3 text-sm text-info">
                  <ActivityOrb sendingReply={false} />
                  {messages.activity.incoming}
                </div>
              ) : null}
            </div>
            {visibleTickets.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                {messages.empty}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {visibleTickets.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={{
                        pathname: pageUrl,
                        query: staffInbox
                          ? { page, ticket: item.id }
                          : {
                              resolved:
                                query.resolved === "1" ? "1" : undefined,
                            },
                        hash: "ticket-detail",
                      }}
                      prefetch={false}
                      aria-current={item.id === ticket?.id ? "page" : undefined}
                      className="block px-5 py-4 hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                    >
                      <span className="line-clamp-2 text-sm font-medium wrap-anywhere">
                        {item.summary}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {item.caseId
                          ? [
                              item.tenantName,
                              item.propertyAddress,
                              item.unitIdentifier,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : messages.unassigned}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <time
                          className="text-xs text-muted-foreground"
                          dateTime={item.updatedAt.toISOString()}
                        >
                          {date.format(item.updatedAt)}
                        </time>
                        <span className="flex flex-wrap gap-1.5">
                          {activityByTicket.has(item.id) ? (
                            <Badge variant="outline" className="text-info">
                              <span
                                aria-hidden="true"
                                className="size-1.5 rounded-full bg-current"
                              />
                              {activityByTicket.get(item.id)?.sendingReply
                                ? messages.activity.sending
                                : messages.activity.reviewing}
                            </Badge>
                          ) : null}
                          <TicketStatus
                            resolved={Boolean(item.resolvedAt)}
                            messages={messages}
                          />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {page > 1 || rows.length > ticketPageSize ? (
              <nav
                aria-label={messages.inbox}
                className="flex justify-between gap-3 border-t border-border px-5 py-3 text-sm"
              >
                {page > 1 ? (
                  <Link
                    href={`${pageUrl}?page=${page - 1}`}
                    prefetch={false}
                    className="hover:underline"
                  >
                    {messages.previous}
                  </Link>
                ) : null}
                {rows.length > ticketPageSize ? (
                  <Link
                    href={`${pageUrl}?page=${page + 1}`}
                    prefetch={false}
                    className="ml-auto hover:underline"
                  >
                    {messages.next}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </section>

          {ticket ? (
            <section
              aria-labelledby="ticket-detail"
              className="rounded-(--radius-card) border border-border bg-card"
            >
              <div className="border-b border-border px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2
                    id="ticket-detail"
                    className="scroll-mt-4 text-lg font-medium"
                  >
                    {messages.report}
                  </h2>
                  <TicketStatus
                    resolved={Boolean(ticket.resolvedAt)}
                    messages={messages}
                  />
                </div>
                <p className="mt-3 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
                  {ticket.summary}
                </p>
                {ticket.caseId ? (
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {messages.tenant}
                      </dt>
                      <dd>{ticket.tenantName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {messages.property}
                      </dt>
                      <dd>{ticket.propertyAddress}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {messages.unit}
                      </dt>
                      <dd>{ticket.unitIdentifier}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {messages.caseReference}
                      </dt>
                      <dd className="font-mono text-xs wrap-anywhere">
                        {ticket.caseId}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <div className="mt-4 rounded-md border border-border p-4">
                    <p className="text-sm font-medium">{messages.unassigned}</p>
                    {tenancies.length ? (
                      <form
                        action={assignTicketTenancy}
                        className="mt-3 space-y-2"
                      >
                        <input
                          type="hidden"
                          name="ticketId"
                          value={ticket.id}
                        />
                        <input type="hidden" name="locale" value={locale} />
                        <label
                          htmlFor="ticket-tenancy"
                          className="block text-sm"
                        >
                          {messages.tenancyLabel}
                        </label>
                        <select
                          id="ticket-tenancy"
                          name="tenancy"
                          required
                          defaultValue=""
                          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <option value="" disabled>
                            {messages.chooseTenancy}
                          </option>
                          {tenancies.map(
                            ({
                              partyId,
                              unitId,
                              tenantName,
                              propertyAddress,
                              unitIdentifier,
                            }) => (
                              <option
                                key={`${partyId}:${unitId}`}
                                value={`${partyId}:${unitId}`}
                              >
                                {tenantName} · {propertyAddress} ·{" "}
                                {unitIdentifier}
                              </option>
                            )
                          )}
                        </select>
                        <button
                          type="submit"
                          className={buttonVariants({ variant: "outline" })}
                        >
                          {messages.assign}
                        </button>
                      </form>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {messages.noTenancies}
                      </p>
                    )}
                    {query.assignment === "unavailable" && (
                      <p role="alert" className="mt-2 text-sm text-destructive">
                        {messages.assignmentUnavailable}
                      </p>
                    )}
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  {messages.opened} ·{" "}
                  <time dateTime={ticket.createdAt.toISOString()}>
                    {date.format(ticket.createdAt)}
                  </time>
                </p>
                {ticket.resolvedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {messages.resolved} ·{" "}
                    <time dateTime={ticket.resolvedAt.toISOString()}>
                      {date.format(ticket.resolvedAt)}
                    </time>
                  </p>
                ) : staffInbox ? (
                  <form action={markTicketResolved} className="mt-4">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <button
                      type="submit"
                      className={buttonVariants({ variant: "outline" })}
                    >
                      {messages.markResolved}
                    </button>
                  </form>
                ) : (
                  <Link
                    href={`${pageUrl}?resolved=1#ticket-detail`}
                    className={buttonVariants({
                      variant: "outline",
                      className: "mt-4",
                    })}
                  >
                    {messages.markResolved}
                  </Link>
                )}
              </div>

              <div className="px-5 py-5 sm:px-6">
                <h3 className="text-base font-medium">{messages.trace}</h3>
                <div role="status">
                  {ticketActivity ? (
                    <div className="mt-3 flex items-center gap-2 rounded-md bg-info-surface px-3 py-2 text-sm font-medium text-info">
                      <ActivityOrb sendingReply={ticketActivity.sendingReply} />
                      {ticketActivity.sendingReply
                        ? messages.activity.sending
                        : messages.activity.reviewing}
                    </div>
                  ) : null}
                </div>
                <ol className="mt-3 divide-y divide-border">
                  {runs.map((run) => (
                    <li key={run.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-sm font-medium">
                          {messages.agents[run.agent]}
                        </p>
                        <time
                          dateTime={run.startedAt.toISOString()}
                          className="text-xs text-muted-foreground"
                        >
                          {date.format(run.startedAt)}
                        </time>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {run.ticketChange !== "none" ? (
                          <Badge variant="secondary">
                            {messages.change[run.ticketChange]}
                          </Badge>
                        ) : null}
                        {run.replyType === "fallback" ? (
                          <Badge variant="secondary">
                            {messages.fallbackReply}
                          </Badge>
                        ) : null}
                        <Badge
                          variant={
                            run.sendStatus === "failed"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {messages.send[run.sendStatus]}
                        </Badge>
                      </div>
                      <details className={styles.details}>
                        <summary className="flex min-h-10 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <span aria-hidden="true" className={styles.icon} />
                          {messages.runDetails}
                        </summary>
                        <div className="min-h-0 overflow-hidden">
                          <dl className="grid gap-2 rounded-md bg-muted px-3 py-2 text-xs sm:grid-cols-2">
                            <div>
                              <dt className="text-muted-foreground">
                                {messages.model}
                              </dt>
                              <dd className="font-mono wrap-anywhere">
                                {run.model}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">
                                {messages.runId}
                              </dt>
                              <dd className="font-mono wrap-anywhere">
                                {run.id}
                              </dd>
                            </div>
                            {run.gatewayGenerationId ? (
                              <div className="sm:col-span-2">
                                <dt className="text-muted-foreground">
                                  {messages.gatewayGenerationId}
                                </dt>
                                <dd className="font-mono wrap-anywhere">
                                  {run.gatewayGenerationId}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        </div>
                      </details>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ) : null}
        </div>
      </WorkspaceShell>
    </DashboardLocaleProvider>
  )
}

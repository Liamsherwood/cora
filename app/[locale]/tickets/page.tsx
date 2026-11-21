import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DashboardLocaleProvider } from "@/components/dashboard/locale"
import { WorkspaceShell } from "@/components/dashboard/workspace"
import { AutoRefresh } from "@/components/partner-connect/auto-refresh"
import { ActivityOrb } from "@/components/tickets/activity-orb"
import { CoraAvatar } from "@/components/tickets/cora-avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { getDb } from "@/lib/db"
import { caseRef, isUuid, ticketRef } from "@/lib/ids"
import { getMessages, type Messages } from "@/lib/i18n/dictionaries"
import { isLocale, localeSettings } from "@/lib/i18n/locales"
import { listTicketActivity } from "@/lib/tickets/activity"
import type { TicketClassification } from "@/lib/tickets/classification"
import {
  listDemoTicketRuns,
  listDemoTickets,
  resolvedDemoTickets,
} from "@/lib/tickets/demo"
import {
  getPublicTicket,
  listPublicTicketRuns,
  listPublicTickets,
  ticketPageSize,
} from "@/lib/tickets/repository"
import styles from "./run-details.module.css"

type TicketRow =
  | NonNullable<Awaited<ReturnType<typeof getPublicTicket>>>
  | ReturnType<typeof listDemoTickets>[number]

function ticketTitle(ticket: TicketRow, messages: Messages["tickets"]) {
  return "summary" in ticket
    ? (ticket.title ?? messages.report)
    : ticket.classification
      ? messages.classification.category[ticket.classification.category]
      : messages.report
}

export const metadata: Metadata = {
  title: "Cora · Centrix",
  robots: { index: false, follow: false },
}

const resolveButtonClassName = buttonVariants({
  variant: "secondary",
  className: "min-h-10",
})

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

function ClassificationBadges({
  classification,
  labels,
}: {
  classification: TicketClassification
  labels: Messages["tickets"]["classification"]
}) {
  return (
    <>
      <Badge variant="secondary">
        {labels.category[classification.category]}
      </Badge>
      <Badge
        variant={
          classification.priority === "emergency" ? "destructive" : "outline"
        }
      >
        {labels.priority[classification.priority]}
      </Badge>
      <Badge variant="outline">{labels.scope[classification.scope]}</Badge>
    </>
  )
}

export default async function TicketsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/tickets">) {
  const [{ locale }, query] = await Promise.all([params, searchParams])
  if (!isLocale(locale)) notFound()
  const { tickets: messages, dashboard } = await getMessages(locale)
  const page =
    typeof query.page === "string" && /^[1-9]\d{0,6}$/.test(query.page)
      ? Number(query.page)
      : 1
  const db = process.env.DATABASE_URL ? getDb() : null
  const resolvedDemoIds = resolvedDemoTickets(query.resolved)
  const examples = listDemoTickets(messages.demo, resolvedDemoIds)
  const requestedExample = examples.find(({ id }) => id === query.ticket)
  const [rows, requestedTicket, activity] = db
    ? await Promise.all([
        listPublicTickets(db, page),
        !requestedExample && isUuid(query.ticket)
          ? getPublicTicket(db, query.ticket)
          : null,
        listTicketActivity(db),
      ])
    : [[], null, []]
  const visibleTickets: TicketRow[] = [
    ...rows.slice(0, ticketPageSize),
    ...(page === 1 ? examples : []),
  ]
  const ticket = requestedExample ?? requestedTicket ?? visibleTickets[0]
  const activityByTicket = new Map(activity.map((run) => [run.ticketId, run]))
  const incomingActivity = activityByTicket.has(null)
  const ticketActivity = ticket && activityByTicket.get(ticket.id)
  const runs = ticket
    ? "summary" in ticket
      ? listDemoTicketRuns(ticket.id)
      : db
        ? await listPublicTicketRuns(db, ticket.id)
        : []
    : []
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
        headingLeading={
          <CoraAvatar
            active={activity.length > 0}
            label={messages.activity.avatarAction}
          />
        }
      >
        {db ? <AutoRefresh /> : null}
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
            <div
              className={
                incomingActivity
                  ? "flex items-center gap-1 border-b border-border bg-info-surface px-3 py-1 text-sm text-info"
                  : undefined
              }
            >
              {incomingActivity ? (
                <ActivityOrb
                  sendingReply={false}
                  label={messages.activity.orbAction}
                />
              ) : null}
              <div role="status">
                {incomingActivity ? messages.activity.incoming : null}
              </div>
            </div>
            {visibleTickets.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                {messages.empty}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {visibleTickets.map((item) => {
                  const itemActivity = activityByTicket.get(item.id)
                  const selected = item.id === ticket?.id
                  return (
                    <li key={item.id} className="flex items-center">
                      <Link
                        href={{
                          pathname: pageUrl,
                          query: {
                            page,
                            ticket: item.id,
                            resolved: resolvedDemoIds,
                          },
                          hash: "ticket-detail",
                        }}
                        prefetch={false}
                        aria-current={selected ? "page" : undefined}
                        className="block min-w-0 flex-1 self-stretch px-5 py-4 hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                      >
                        <span className="line-clamp-2 text-sm font-medium wrap-anywhere">
                          {"summary" in item
                            ? (item.title ?? item.summary)
                            : ticketTitle(item, messages)}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {"summary" in item
                            ? item.caseId
                              ? [
                                  item.tenantName,
                                  item.propertyAddress,
                                  item.unitIdentifier,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : messages.unassigned
                            : ticketRef(item.id)}
                        </span>
                        <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <time
                            className="text-xs text-muted-foreground"
                            dateTime={item.updatedAt.toISOString()}
                          >
                            {date.format(item.updatedAt)}
                          </time>
                          <span className="flex flex-wrap gap-1.5">
                            {itemActivity ? (
                              <Badge variant="outline" className="text-info">
                                {itemActivity.sendingReply
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
                      {itemActivity && !selected ? (
                        <div className="mr-2 shrink-0">
                          <ActivityOrb
                            sendingReply={itemActivity.sendingReply}
                            label={messages.activity.orbAction}
                          />
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
            {page > 1 || rows.length > ticketPageSize ? (
              <nav
                aria-label={messages.inbox}
                className="flex justify-between gap-3 border-t border-border px-5 py-3 text-sm"
              >
                {page > 1 ? (
                  <Link
                    href={{
                      pathname: pageUrl,
                      query: { page: page - 1, resolved: resolvedDemoIds },
                    }}
                    prefetch={false}
                    className="hover:underline"
                  >
                    {messages.previous}
                  </Link>
                ) : null}
                {rows.length > ticketPageSize ? (
                  <Link
                    href={{
                      pathname: pageUrl,
                      query: { page: page + 1, resolved: resolvedDemoIds },
                    }}
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
                    {ticketTitle(ticket, messages)} · {ticketRef(ticket.id)}
                  </h2>
                  <TicketStatus
                    resolved={Boolean(ticket.resolvedAt)}
                    messages={messages}
                  />
                </div>
                <div className="flex items-center gap-1 text-xs font-medium text-info">
                  {ticketActivity ? (
                    <ActivityOrb
                      sendingReply={ticketActivity.sendingReply}
                      label={messages.activity.orbAction}
                    />
                  ) : null}
                  <div role="status">
                    {ticketActivity
                      ? ticketActivity.sendingReply
                        ? messages.activity.sending
                        : messages.activity.reviewing
                      : null}
                  </div>
                </div>
                {"summary" in ticket ? (
                  <p className="mt-3 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
                    {ticket.summary}
                  </p>
                ) : null}
                {ticket.classification ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <ClassificationBadges
                      classification={ticket.classification}
                      labels={messages.classification}
                    />
                  </div>
                ) : null}
                {ticket.caseId ? (
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    {"summary" in ticket ? (
                      <>
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
                          <dd>
                            {ticket.unitIdentifier ??
                              messages.classification.scope.common}
                          </dd>
                        </div>
                      </>
                    ) : null}
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {messages.caseReference}
                      </dt>
                      <dd className="font-mono text-xs wrap-anywhere">
                        {caseRef(ticket.caseId)}
                      </dd>
                    </div>
                  </dl>
                ) : "summary" in ticket ? (
                  <div className="mt-4 rounded-md border border-border p-4">
                    <p className="text-sm font-medium">{messages.unassigned}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {messages.noTenancies}
                    </p>
                  </div>
                ) : null}
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
                ) : "summary" in ticket ? (
                  <Link
                    href={{
                      pathname: pageUrl,
                      query: {
                        ticket: ticket.id,
                        resolved: [...resolvedDemoIds, ticket.id],
                      },
                      hash: "ticket-detail",
                    }}
                    className={`${resolveButtonClassName} mt-4`}
                  >
                    {messages.markResolved}
                  </Link>
                ) : null}
              </div>

              <div className="px-5 py-5 sm:px-6">
                <h3 className="text-base font-medium">{messages.trace}</h3>
                <ol className="mt-3 divide-y divide-border">
                  {runs.map((run) => (
                    <li
                      key={run.id}
                      id={`run-${run.id}`}
                      className="scroll-mt-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-sm font-medium">
                          {messages.channels[run.agent]}
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
                        {run.classification ? (
                          <ClassificationBadges
                            classification={run.classification}
                            labels={messages.classification}
                          />
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
                      {"model" in run ? (
                        <details className={styles.details}>
                          <summary className="flex min-h-10 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                            <span aria-hidden="true" className={styles.icon} />
                            {messages.runDetails}
                          </summary>
                          <div className="min-h-0 overflow-hidden">
                            <dl className="grid gap-2 rounded-md bg-muted px-3 py-2 text-xs sm:grid-cols-2">
                              {typeof run.model === "string" ? (
                                <div>
                                  <dt className="text-muted-foreground">
                                    {messages.model}
                                  </dt>
                                  <dd className="font-mono wrap-anywhere">
                                    {run.model}
                                  </dd>
                                </div>
                              ) : null}
                              <div>
                                <dt className="text-muted-foreground">
                                  {messages.runId}
                                </dt>
                                <dd className="font-mono wrap-anywhere">
                                  {run.id}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        </details>
                      ) : null}
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

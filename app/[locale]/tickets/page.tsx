import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DashboardLocaleProvider } from "@/components/dashboard/locale"
import { WorkspaceShell } from "@/components/dashboard/workspace"
import { AutoRefresh } from "@/components/partner-connect/auto-refresh"
import { ActivityOrb } from "@/components/tickets/activity-orb"
import {
  ContractorPanel,
  type BookedVisitView,
} from "@/components/tickets/contractor-panel"
import { CoraAvatar } from "@/components/tickets/cora-avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { activeWorkOrder } from "@/lib/contractors/match"
import { getDb } from "@/lib/db"
import { caseRef, isUuid, ticketRef } from "@/lib/ids"
import { getMessages, type Messages } from "@/lib/i18n/dictionaries"
import { formatMessage } from "@/lib/i18n/format-message"
import { isLocale, localeSettings } from "@/lib/i18n/locales"
import { listTicketActivity } from "@/lib/tickets/activity"
import type { TicketClassification } from "@/lib/tickets/classification"
import type { TicketDetails } from "@/lib/tickets/details"
import {
  listDemoTicketRuns,
  listDemoTickets,
  resolvedDemoTickets,
} from "@/lib/tickets/demo"
import { ticketPlan, tradeFor, type TicketPlan } from "@/lib/tickets/playbook"
import {
  getTicket,
  listTicketCalls,
  listTicketRuns,
  listTickets,
  ticketPageSize,
  type TicketCall,
} from "@/lib/tickets/repository"
import { clock } from "@/lib/time"
import { resolveTicketAction } from "./actions"
import styles from "./run-details.module.css"

type LiveTicket = NonNullable<Awaited<ReturnType<typeof getTicket>>>
type TicketView =
  (LiveTicket & { demo: false }) | ReturnType<typeof listDemoTickets>[number]

const live = (ticket: LiveTicket): TicketView => ({ ...ticket, demo: false })

/** The agent's title; tickets filed before titles existed fall back to their category. */
function ticketTitle(ticket: TicketView, messages: Messages["tickets"]) {
  return (
    ticket.title ??
    (ticket.classification
      ? messages.classification.category[ticket.classification.category]
      : messages.report)
  )
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

const residentFields = [
  "location",
  "since",
  "residentActions",
  "safetyAdvice",
  "access",
] as const satisfies (keyof TicketDetails)[]

function ResidentDetails({
  details,
  labels,
  languageName,
}: {
  details: TicketDetails
  labels: Messages["tickets"]["resident"]
  languageName: (code: string) => string
}) {
  const facts = residentFields.filter((field) => details[field])
  if (!details.description && !facts.length) return null
  return (
    <section aria-labelledby="ticket-resident" className="mt-5">
      <h3 id="ticket-resident" className="text-sm font-medium">
        {labels.title}
      </h3>
      {details.description ? (
        <blockquote
          lang={details.language}
          className="mt-2 border-l-2 border-border pl-3 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-muted-foreground"
        >
          {details.description}
        </blockquote>
      ) : null}
      {facts.length || details.language ? (
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          {facts.map((field) => (
            <div key={field}>
              <dt className="text-xs text-muted-foreground">{labels[field]}</dt>
              <dd className="wrap-anywhere">{details[field]}</dd>
            </div>
          ))}
          {details.language ? (
            <div>
              <dt className="text-xs text-muted-foreground">
                {labels.language}
              </dt>
              <dd>{languageName(details.language)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  )
}

function NextSteps({
  plan,
  labels,
  doneLabel,
  formatDue,
}: {
  plan: TicketPlan
  labels: Messages["tickets"]["plan"]
  doneLabel: string
  formatDue: (due: NonNullable<TicketPlan["due"]>) => string
}) {
  if (!plan.steps.length) return null
  return (
    <section
      aria-labelledby="ticket-next-steps"
      className="mt-5 rounded-md border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 id="ticket-next-steps" className="text-sm font-medium">
          {labels.title}
        </h3>
        {plan.target ? (
          <p className="text-xs text-muted-foreground">
            {formatMessage(labels.respond, {
              target: labels.targets[plan.target],
            })}
            {plan.due
              ? ` · ${formatMessage(labels.due, { due: formatDue(plan.due) })}`
              : null}
          </p>
        ) : null}
        {plan.overdue ? (
          <Badge variant="destructive">{labels.overdue}</Badge>
        ) : null}
      </div>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm marker:text-muted-foreground">
        {plan.steps.map((step) =>
          step.kind === "commission" ? (
            <li
              key={step.kind}
              className={step.done ? "text-muted-foreground" : undefined}
            >
              <span className={step.done ? "line-through" : undefined}>
                {formatMessage(labels.steps.commission, {
                  trade: labels.trades[step.trade],
                })}
              </span>
              {step.done ? (
                <Badge className="ml-2 bg-success-surface text-success">
                  {doneLabel}
                </Badge>
              ) : null}
            </li>
          ) : (
            <li key={step.kind}>{labels.steps[step.kind]}</li>
          )
        )}
      </ol>
    </section>
  )
}

function CallRecaps({
  calls,
  labels,
  formatDate,
}: {
  calls: TicketCall[]
  labels: Messages["tickets"]["calls"]
  formatDate: (date: Date) => string
}) {
  if (!calls.length) return null
  return (
    <div className="border-b border-border px-5 py-5 sm:px-6">
      <h3 className="text-base font-medium">{labels.title}</h3>
      <ul className="mt-3 divide-y divide-border">
        {calls.map((call) => (
          <li key={call.conversationId} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <time dateTime={call.endedAt.toISOString()}>
                {formatDate(call.endedAt)}
              </time>
              {call.durationSecs !== null ? (
                <span>
                  {labels.duration} {formatDuration(call.durationSecs)}
                </span>
              ) : null}
              {call.successful !== null ? (
                <Badge variant={call.successful ? "outline" : "destructive"}>
                  {call.successful
                    ? labels.outcome.success
                    : labels.outcome.failure}
                </Badge>
              ) : null}
            </div>
            {call.summary ? (
              <p className="mt-2 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
                {call.summary}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatDuration(secs: number) {
  const minutes = Math.floor(secs / 60)
  const seconds = Math.round(secs % 60)
  return minutes ? `${minutes} min ${seconds} s` : `${seconds} s`
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
        listTickets(db, page),
        !requestedExample && isUuid(query.ticket)
          ? getTicket(db, query.ticket)
          : null,
        listTicketActivity(db),
      ])
    : [[], null, []]
  const visibleTickets: TicketView[] = [
    ...rows.slice(0, ticketPageSize).map(live),
    ...(page === 1 ? examples : []),
  ]
  const ticket =
    requestedExample ??
    (requestedTicket ? live(requestedTicket) : visibleTickets[0])
  const activityByTicket = new Map(activity.map((run) => [run.ticketId, run]))
  const incomingActivity = activityByTicket.has(null)
  const ticketActivity = ticket && activityByTicket.get(ticket.id)
  const runs = !ticket
    ? []
    : ticket.demo
      ? listDemoTicketRuns(ticket.id)
      : db
        ? await listTicketRuns(db, ticket.id)
        : []
  const calls =
    db && ticket && !ticket.demo
      ? await listTicketCalls(db, [
          ...new Set(
            runs.flatMap((run) =>
              run.conversationId ? [run.conversationId] : []
            )
          ),
        ])
      : []
  const workOrder =
    db && ticket && !ticket.demo && ticket.caseId
      ? await activeWorkOrder(db, ticket.caseId)
      : null
  // Tickets are stamped on the real clock, so their targets are measured on it too.
  const plan = ticket
    ? ticketPlan({ ...ticket, commissioned: Boolean(workOrder) }, clock())
    : null
  const trade = ticket?.classification
    ? tradeFor[ticket.classification.category]
    : null
  const { intlLocale } = localeSettings[locale]
  const date = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Berlin",
  })
  const dueTime = new Intl.DateTimeFormat(intlLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  })
  const dueDay = new Intl.DateTimeFormat(intlLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
  const booked: BookedVisitView | null = workOrder
    ? {
        contractorName: workOrder.contractorName,
        contractorPhone: workOrder.contractorPhone,
        baseCity: workOrder.baseCity,
        when: workOrder.scheduledAt
          ? dueTime.format(workOrder.scheduledAt)
          : null,
        status: workOrder.status,
      }
    : null
  const formatDue = (due: NonNullable<TicketPlan["due"]>) =>
    "at" in due
      ? dueTime.format(due.at)
      : dueDay.format(new Date(`${due.day}T12:00:00Z`))
  const languages = new Intl.DisplayNames([intlLocale], { type: "language" })
  const languageName = (code: string) => {
    try {
      return languages.of(code) ?? code
    } catch {
      return code
    }
  }
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
                          {ticketTitle(item, messages)}
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
                    {ticketTitle(ticket, messages)} ·{" "}
                    <span className="whitespace-nowrap">
                      {ticketRef(ticket.id)}
                    </span>
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
                <p className="mt-3 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
                  {ticket.summary}
                </p>
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
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {messages.caseReference}
                      </dt>
                      <dd className="font-mono text-xs wrap-anywhere">
                        {caseRef(ticket.caseId)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-4 text-sm font-medium">
                    {messages.unassigned}
                  </p>
                )}
                {ticket.details ? (
                  <ResidentDetails
                    details={ticket.details}
                    labels={messages.resident}
                    languageName={languageName}
                  />
                ) : null}
                {plan ? (
                  <NextSteps
                    plan={plan}
                    labels={messages.plan}
                    doneLabel={messages.contractor.booked}
                    formatDue={formatDue}
                  />
                ) : null}
                {!ticket.demo &&
                ticket.caseId &&
                trade &&
                (booked || !ticket.resolvedAt) ? (
                  <ContractorPanel
                    ticketId={ticket.id}
                    city={ticket.propertyCity ?? ticket.propertyAddress ?? ""}
                    trade={messages.plan.trades[trade]}
                    booked={booked}
                    labels={messages.contractor}
                    intlLocale={intlLocale}
                  />
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
                ) : ticket.demo ? (
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
                ) : (
                  <form action={resolveTicketAction}>
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <button
                      type="submit"
                      className={`${resolveButtonClassName} mt-4`}
                    >
                      {messages.markResolved}
                    </button>
                  </form>
                )}
              </div>

              <CallRecaps
                calls={calls}
                labels={messages.calls}
                formatDate={(at) => date.format(at)}
              />

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
                      <details className={styles.details}>
                        <summary className="flex min-h-10 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <span aria-hidden="true" className={styles.icon} />
                          {messages.runDetails}
                        </summary>
                        <div className="min-h-0 overflow-hidden">
                          <dl className="grid gap-2 rounded-md bg-muted px-3 py-2 text-xs sm:grid-cols-2">
                            {run.model ? (
                              <div>
                                <dt className="text-muted-foreground">
                                  {messages.model}
                                </dt>
                                <dd className="font-mono wrap-anywhere">
                                  {run.model}
                                </dd>
                              </div>
                            ) : null}
                            {run.conversationId ? (
                              <div>
                                <dt className="text-muted-foreground">
                                  {messages.conversationId}
                                </dt>
                                <dd className="font-mono wrap-anywhere">
                                  {run.conversationId}
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

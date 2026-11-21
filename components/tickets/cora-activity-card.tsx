import {
  ArrowRightIcon,
  Call02Icon,
  Message01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { AutoRefresh } from "@/components/partner-connect/auto-refresh"
import { buttonVariants } from "@/components/ui/button"
import { getDb } from "@/lib/db"
import type { Messages } from "@/lib/i18n/dictionaries"
import { localeSettings, type Locale } from "@/lib/i18n/locales"
import { listTicketActivity } from "@/lib/tickets/activity"
import { listRecentDemoTicketRuns } from "@/lib/tickets/demo"
import { listRecentTicketRuns } from "@/lib/tickets/repository"

import { CoraAvatar } from "./cora-avatar"

export async function CoraActivityCard({
  locale,
  messages,
}: {
  locale: Locale
  messages: Messages
}) {
  const db = process.env.DATABASE_URL ? getDb() : null
  const [recentRuns, activity] = db
    ? await Promise.all([listRecentTicketRuns(db, 3), listTicketActivity(db)])
    : [[], []]
  const runs = [...recentRuns, ...listRecentDemoTicketRuns(3)].slice(0, 3)
  const active = activity.length > 0
  const labels = messages.dashboard.coraActivity
  const tickets = messages.tickets
  const date = new Intl.DateTimeFormat(localeSettings[locale].intlLocale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  })
  const inbox = `/${locale}/tickets`

  return (
    <section
      aria-labelledby="cora-activity-card"
      className="flex flex-1 flex-col rounded-(--radius-card) border border-border bg-card p-5 shadow-panel sm:p-6"
    >
      {db ? <AutoRefresh intervalMs={10000} /> : null}
      <div className="flex items-center gap-2.5">
        <CoraAvatar active={active} size={48} />
        <div className="min-w-0">
          <h2
            id="cora-activity-card"
            className="text-base font-medium tracking-tight"
          >
            {labels.title}
          </h2>
          <div role="status">
            {active ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-info">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-current"
                />
                {activity.some((item) => !item.sendingReply)
                  ? tickets.activity.reviewing
                  : tickets.activity.sending}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {runs.length > 0 ? (
        <ol className="mt-2 divide-y divide-border">
          {runs.map((run) => {
            const action =
              run.ticketChange === "none"
                ? tickets.send[run.sendStatus]
                : tickets.change[run.ticketChange]
            return (
              <li key={run.id}>
                <a
                  href={`${inbox}?ticket=${run.ticketId}#run-${run.id}`}
                  className="-mx-2 flex min-h-12 items-center gap-2.5 rounded-md px-2 py-2.5 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <HugeiconsIcon
                    icon={
                      run.agent === "cora-voice" ? Call02Icon : Message01Icon
                    }
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {action}
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {tickets.channels[run.agent]}
                    </span>
                  </span>
                  <time
                    dateTime={run.startedAt.toISOString()}
                    className="max-w-[42%] text-right text-xs text-muted-foreground"
                  >
                    {date.format(run.startedAt)}
                  </time>
                </a>
              </li>
            )
          })}
        </ol>
      ) : !active ? (
        <p className="py-5 text-sm text-muted-foreground">{labels.empty}</p>
      ) : null}
      <div className="mt-auto pt-3">
        <a
          href={inbox}
          className={buttonVariants({
            variant: "ghost",
            className:
              "-ml-2 h-auto min-h-11 max-w-full px-2 py-1.5 text-left whitespace-normal text-accent-foreground sm:min-h-9",
          })}
        >
          {labels.openInbox}
          <HugeiconsIcon icon={ArrowRightIcon} aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}

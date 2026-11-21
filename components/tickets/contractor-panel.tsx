"use client"

import {
  Alert02Icon,
  Call02Icon,
  Calendar03Icon,
  Location01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import {
  commissionContractorAction,
  findContractorsAction,
} from "@/app/[locale]/tickets/actions"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import type { ContractorSearch } from "@/lib/contractors/match"
import type { Messages } from "@/lib/i18n/dictionaries"
import { formatMessage } from "@/lib/i18n/format-message"

const ThinkingOrb = dynamic(() =>
  import("thinking-orbs").then((module) => module.ThinkingOrb)
)

type Labels = Messages["tickets"]["contractor"]
type Candidate = ContractorSearch["shortlist"][number]

/** A booked visit, formatted on the server so the first render matches. */
export type BookedVisitView = {
  contractorName: string
  contractorPhone: string | null
  baseCity: string | null
  when: string | null
  status: string
}

type Stage = { text: string; state: "active" | "done" }
type OrbState = "searching" | "solving" | "connecting"

type Phase =
  | { kind: "idle"; error?: string }
  | { kind: "working"; stages: Stage[]; orb: OrbState }
  | { kind: "results"; search: ContractorSearch; error?: string }
  | { kind: "booked"; visit: BookedVisitView }

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Finds and books a contractor for a ticket. The ranking and the booking are real
 * (server actions over centrix data); the pacing of the progress steps is staged so
 * staff can follow what is being checked. Only the contractor's confirmation is
 * simulated, and the panel says so.
 */
export function ContractorPanel({
  ticketId,
  city,
  trade,
  booked,
  labels,
  intlLocale,
}: {
  ticketId: string
  city: string
  trade: string
  booked: BookedVisitView | null
  labels: Labels
  intlLocale: string
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const pause = (ms: number) =>
    new Promise<void>((resolve) =>
      setTimeout(resolve, prefersReducedMotion() ? Math.min(ms, 250) : ms)
    )
  const show = (next: Phase) => {
    if (alive.current) setPhase(next)
  }
  const when = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Berlin",
    }).format(new Date(iso))
  const t = formatMessage

  async function search() {
    const area = t(labels.stages.area, { city })
    show({
      kind: "working",
      orb: "searching",
      stages: [{ text: area, state: "active" }],
    })
    const [result] = await Promise.all([
      findContractorsAction(ticketId),
      pause(1100),
    ])
    if (!result.ok) return show({ kind: "idle", error: result.error })
    const found = result.data
    const areaDone: Stage = {
      text: t(labels.stages.areaDone, {
        inArea: String(found.inArea),
        searched: String(found.searched),
        city: found.city,
      }),
      state: "done",
    }
    show({
      kind: "working",
      orb: "solving",
      stages: [areaDone, { text: labels.stages.history, state: "active" }],
    })
    await pause(1000)
    const historyDone: Stage = {
      text: labels.stages.historyDone,
      state: "done",
    }
    show({
      kind: "working",
      orb: "searching",
      stages: [
        areaDone,
        historyDone,
        {
          text:
            found.priority === "emergency"
              ? labels.stages.availabilityEmergency
              : labels.stages.availability,
          state: "active",
        },
      ],
    })
    await pause(900)
    show({ kind: "results", search: found })
  }

  async function book(found: ContractorSearch, candidate: Candidate) {
    const sending = t(labels.stages.sending, { name: candidate.name })
    show({
      kind: "working",
      orb: "connecting",
      stages: [{ text: sending, state: "active" }],
    })
    const [result] = await Promise.all([
      commissionContractorAction(ticketId, candidate.partyId),
      pause(1000),
    ])
    if (!result.ok)
      return show({ kind: "results", search: found, error: result.error })
    const sent: Stage = {
      text: t(labels.stages.sendingDone, { name: candidate.name }),
      state: "done",
    }
    show({
      kind: "working",
      orb: "connecting",
      stages: [
        sent,
        {
          text: t(labels.stages.confirming, { name: candidate.name }),
          state: "active",
        },
      ],
    })
    await pause(1200)
    show({
      kind: "booked",
      visit: {
        contractorName: result.data.contractorName,
        contractorPhone: candidate.phone,
        baseCity: candidate.baseCity,
        when: result.data.scheduledAt ? when(result.data.scheduledAt) : null,
        status: "scheduled",
      },
    })
    router.refresh()
  }

  const visit = phase.kind === "booked" ? phase.visit : booked
  const error = phase.kind === "idle" ? phase.error : undefined

  return (
    <section
      aria-labelledby="ticket-contractor"
      className="mt-5 rounded-md border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="ticket-contractor" className="text-sm font-medium">
          {labels.title}
        </h3>
        <Badge variant="secondary">
          {trade.charAt(0).toUpperCase() + trade.slice(1)}
        </Badge>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={Location01Icon}
            className="size-3.5"
            aria-hidden="true"
          />
          {city}
        </span>
      </div>

      <div role="status" aria-live="polite">
        {visit && phase.kind !== "working" ? (
          <BookedCard visit={visit} labels={labels} />
        ) : phase.kind === "working" ? (
          <ol className="mt-3 space-y-2">
            {phase.stages.map((stage) => (
              <li
                key={stage.text}
                className="flex min-h-6 items-center gap-2.5 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="grid size-5 shrink-0 place-items-center"
                >
                  {stage.state === "active" ? (
                    <ThinkingOrb
                      state={phase.orb}
                      size={20}
                      paused={prefersReducedMotion()}
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      className="size-4 text-success"
                    />
                  )}
                </span>
                <span
                  className={
                    stage.state === "done"
                      ? "text-muted-foreground"
                      : "font-medium"
                  }
                >
                  {stage.text}
                </span>
              </li>
            ))}
          </ol>
        ) : phase.kind === "results" ? (
          <Shortlist
            search={phase.search}
            error={phase.error}
            labels={labels}
            when={when}
            onBook={(candidate) => book(phase.search, candidate)}
            onBack={() => show({ kind: "idle" })}
          />
        ) : (
          <div className="mt-2">
            <p className="text-sm text-muted-foreground">
              {t(labels.intro, { trade, city })}
            </p>
            {error ? <ErrorLine text={error} /> : null}
            <button
              type="button"
              onClick={search}
              className={buttonVariants({ className: "mt-3 min-h-10" })}
            >
              {error ? labels.retry : labels.find}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
      <HugeiconsIcon
        icon={Alert02Icon}
        className="size-4 shrink-0"
        aria-hidden="true"
      />
      {text}
    </p>
  )
}

function Shortlist({
  search,
  error,
  labels,
  when,
  onBook,
  onBack,
}: {
  search: ContractorSearch
  error?: string
  labels: Labels
  when: (iso: string) => string
  onBook: (candidate: Candidate) => void
  onBack: () => void
}) {
  const t = formatMessage
  return (
    <div className="mt-3">
      {search.inArea === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {t(labels.noneInArea, { city: search.city })}
        </p>
      ) : null}
      {error ? <ErrorLine text={error} /> : null}
      <ul className="space-y-2.5">
        {search.shortlist.map((candidate, index) => {
          const reasons = [
            candidate.inArea
              ? t(labels.reasons.covers, { city: search.city })
              : labels.reasons.outside,
            candidate.distanceKm === 0
              ? t(labels.reasons.local, { city: candidate.baseCity })
              : candidate.distanceKm !== null
                ? t(labels.reasons.distance, {
                    city: candidate.baseCity,
                    km: String(candidate.distanceKm),
                  })
                : null,
            candidate.emergencyService ? labels.reasons.emergency : null,
            candidate.jobsHere === 1
              ? labels.reasons.jobsHereOne
              : candidate.jobsHere > 1
                ? t(labels.reasons.jobsHere, {
                    count: String(candidate.jobsHere),
                  })
                : null,
          ].filter((reason): reason is string => Boolean(reason))
          const best = index === 0
          return (
            <li
              key={candidate.partyId}
              className={
                best
                  ? "rounded-md border border-info/40 bg-info-surface/60 p-3"
                  : "rounded-md border border-border p-3"
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{candidate.name}</p>
                {best ? (
                  <Badge className="bg-info text-info-surface">
                    {labels.bestMatch}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reasons.map((reason) => (
                  <Badge
                    key={reason}
                    variant={
                      reason === labels.reasons.outside
                        ? "destructive"
                        : "outline"
                    }
                  >
                    {reason}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <HugeiconsIcon
                    icon={Calendar03Icon}
                    className="size-3.5"
                    aria-hidden="true"
                  />
                  {t(labels.firstVisit, { when: when(candidate.visit) })}
                </span>
                <button
                  type="button"
                  onClick={() => onBook(candidate)}
                  className={buttonVariants({
                    variant: best ? "default" : "secondary",
                    className: "min-h-10",
                  })}
                >
                  {labels.book}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={onBack}
        className={buttonVariants({
          variant: "ghost",
          className: "mt-2 -ml-2 min-h-10",
        })}
      >
        {labels.back}
      </button>
    </div>
  )
}

function BookedCard({
  visit,
  labels,
}: {
  visit: BookedVisitView
  labels: Labels
}) {
  const status =
    labels.status[visit.status as keyof Labels["status"]] ?? visit.status
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <HugeiconsIcon
          icon={Tick02Icon}
          className="size-4 text-success"
          aria-hidden="true"
        />
        <p className="text-sm font-medium">
          {labels.booked} · {visit.contractorName}
          {visit.baseCity ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {visit.baseCity}
            </span>
          ) : null}
        </p>
        <Badge className="bg-success-surface text-success">{status}</Badge>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {visit.when ? (
          <div>
            <dt className="text-xs text-muted-foreground">{labels.visit}</dt>
            <dd>{visit.when}</dd>
          </div>
        ) : null}
        {visit.contractorPhone ? (
          <div>
            <dt className="text-xs text-muted-foreground">{labels.phone}</dt>
            <dd className="flex items-center gap-1.5">
              <HugeiconsIcon
                icon={Call02Icon}
                className="size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <a
                href={`tel:${visit.contractorPhone.replace(/\s+/g, "")}`}
                className="hover:underline"
              >
                {visit.contractorPhone}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        {labels.residentInformed} {labels.simulated}
      </p>
    </div>
  )
}

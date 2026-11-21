"use client"

import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  advanceDispatchAction,
  listDispatchesAction,
  startDispatchAction,
} from "@/app/[locale]/dispatch-actions"
import { CoraAvatar } from "@/components/tickets/cora-avatar"
import {
  stepOf,
  type DispatchStep,
  type DispatchView,
} from "@/lib/dispatch/steps"
import { localeSettings } from "@/lib/i18n/locales"
import { cn } from "@/lib/utils"

import styles from "./cora-task.module.css"
import type { Request } from "./data"
import { formatMessage, useDashboardLocale } from "./locale"

/** Time a working step stays on screen, so a person can follow along. */
const STEP_MS = 1100
/** How often to check for the contractor's reply. */
const WAIT_MS = 1500

export const demoResetEvent = "cora:demo-reset"

const isActive = (d: DispatchView) =>
  d.status === "working" || d.status === "waiting"

// ------------------------------------------------------------------ driver

type CoraDispatch = {
  byRequest: Map<string, DispatchView>
  start: (request: Request) => Promise<void>
  starting: string | null
  error: string | null
}

const CoraDispatchContext = createContext<CoraDispatch | null>(null)
export const CoraDispatchProvider = CoraDispatchContext

export function useCoraDispatch() {
  return use(CoraDispatchContext)
}

/**
 * Loads Cora's dispatches and walks the active ones forward, one step per call. It
 * lives on the dashboard, so Cora keeps working when the request dialog closes.
 */
export function useDispatchDriver(): CoraDispatch {
  const [dispatches, setDispatches] = useState<DispatchView[]>([])
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  const upsert = useCallback((view: DispatchView) => {
    if (!mounted.current) return
    setDispatches((current) => [
      view,
      ...current.filter((d) => d.id !== view.id),
    ])
  }, [])

  const reload = useCallback(async () => {
    const { data } = await listDispatchesAction()
    if (data && mounted.current) setDispatches(data)
  }, [])

  useEffect(() => {
    mounted.current = true
    void reload()
    window.addEventListener(demoResetEvent, reload)
    return () => {
      mounted.current = false
      window.removeEventListener(demoResetEvent, reload)
    }
  }, [reload])

  useEffect(() => {
    const active = dispatches.filter(isActive)
    if (active.length === 0) return
    const working = active.some((d) => d.status === "working")
    const timer = window.setTimeout(
      async () => {
        for (const d of active) {
          const { data } = await advanceDispatchAction(d.id)
          if (data) upsert(data)
          else void reload()
        }
      },
      working ? STEP_MS : WAIT_MS
    )
    return () => window.clearTimeout(timer)
  }, [dispatches, upsert, reload])

  const start = useCallback(
    async (request: Request) => {
      setStarting(request.id)
      setError(null)
      const result = await startDispatchAction({
        requestKey: request.id,
        propertyId: request.propertyId,
        title: request.title,
        description: request.description,
        priority: request.priority,
      })
      setStarting(null)
      if (result.data) upsert(result.data)
      else setError(result.error)
    },
    [upsert]
  )

  const byRequest = useMemo(
    () => new Map(dispatches.map((d) => [d.requestKey, d])),
    [dispatches]
  )
  return { byRequest, start, starting, error }
}

/** A request Cora booked is scheduled, unless someone resolved it since. */
export function withDispatchStatus(
  requests: Request[],
  byRequest: Map<string, DispatchView>
): Request[] {
  return requests.map((request) =>
    request.status !== "Resolved" &&
    byRequest.get(request.id)?.status === "done"
      ? { ...request, status: "Scheduled" as const }
      : request
  )
}

// ------------------------------------------------------------------ view

function useSlotFormat() {
  const { locale } = useDashboardLocale()
  return useMemo(() => {
    const intl = localeSettings[locale].intlLocale
    const day = new Intl.DateTimeFormat(intl, {
      timeZone: "Europe/Berlin",
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    const time = new Intl.DateTimeFormat(intl, {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    })
    const currency = new Intl.NumberFormat(intl, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    })
    return {
      slot: ({ start, end }: { start: string; end: string }) =>
        `${day.format(new Date(start))} · ${time.format(new Date(start))}–${time.format(new Date(end))}`,
      time: (at: string) => time.format(new Date(at)),
      currency: (eur: string) => currency.format(Number(eur)),
    }
  }, [locale])
}

/** The step Cora is on: the first one not done, unless she stopped. */
function currentStep(dispatch: DispatchView) {
  return isActive(dispatch)
    ? dispatch.steps.find((s) => s.status !== "done")
    : undefined
}

export function CoraTask({ dispatch }: { dispatch: DispatchView }) {
  const { messages } = useDashboardLocale()
  const labels = messages.cora
  const format = useSlotFormat()
  const current = currentStep(dispatch)
  const contractor = stepOf(dispatch.steps, "contractor")?.detail?.name ?? ""
  const failed = dispatch.steps.find((s) => s.status === "failed")
  const slot = stepOf(dispatch.steps, "slot")?.detail

  const headline = current
    ? formatMessage(labels.doing[current.key], { contractor })
    : failed?.error
      ? formatMessage(labels.errors[failed.error], { contractor })
      : slot
        ? formatMessage(labels.booked, { slot: format.slot(slot) })
        : ""

  return (
    <section
      aria-label={labels.region}
      className="mt-5 border-t border-border pt-5"
    >
      <div className="flex items-center gap-3">
        <CoraAvatar active={isActive(dispatch)} size={40} />
        <p
          role="status"
          className={cn(
            "min-w-0 text-sm font-medium",
            failed && "text-destructive"
          )}
        >
          {/* Keyed so each new headline enters instead of swapping in place. */}
          <span key={headline} className={cn("block", styles.reveal)}>
            {headline}
          </span>
        </p>
      </div>
      <ol className="mt-4">
        {dispatch.steps.map((step, index) => (
          <Step
            key={step.key}
            step={step}
            running={step === current}
            last={index === dispatch.steps.length - 1}
            format={format}
          />
        ))}
      </ol>
    </section>
  )
}

function Step({
  step,
  running,
  last,
  format,
}: {
  step: DispatchStep
  running: boolean
  last: boolean
  format: ReturnType<typeof useSlotFormat>
}) {
  const { messages } = useDashboardLocale()
  const labels = messages.cora
  const finished = step.status === "done" || step.status === "failed"

  return (
    <li className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
      {!last && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-5 bottom-1 left-[7.5px] w-px",
            styles.rail,
            step.status === "done" ? "bg-success/40" : "bg-border"
          )}
        />
      )}
      <span className="flex h-5 items-center justify-center">
        <StepIcon status={running ? "running" : step.status} />
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "text-sm leading-5",
            styles.label,
            finished || running ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {labels.steps[step.key]}
          <span className="sr-only">
            {" "}
            · {running ? labels.state.running : labels.state[step.status]}
          </span>
        </p>
        {finished && <StepDetail step={step} format={format} />}
      </div>
    </li>
  )
}

function StepIcon({ status }: { status: DispatchStep["status"] }) {
  if (status === "done")
    return (
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        size={16}
        aria-hidden="true"
        className={cn("text-success", styles.settle)}
      />
    )
  if (status === "failed")
    return (
      <HugeiconsIcon
        icon={Alert02Icon}
        size={16}
        aria-hidden="true"
        className={cn("text-destructive", styles.settle)}
      />
    )
  if (status === "running")
    return (
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5 rounded-full border-2 border-info/20 border-t-info",
          styles.spinner
        )}
      />
    )
  return <span aria-hidden="true" className="size-1.5 rounded-full bg-border" />
}

function StepDetail({
  step,
  format,
}: {
  step: DispatchStep
  format: ReturnType<typeof useSlotFormat>
}) {
  const { messages } = useDashboardLocale()
  const labels = messages.cora
  const line = (text: string) => (
    <p
      className={cn(
        "mt-0.5 text-sm leading-5 wrap-anywhere text-muted-foreground",
        styles.reveal
      )}
    >
      {text}
    </p>
  )

  switch (step.key) {
    case "building": {
      if (!step.detail) return null
      const { system, builtYear, previousCases } = step.detail
      return line(
        [
          system &&
            (labels.systems[system as keyof typeof labels.systems] ?? system),
          builtYear &&
            formatMessage(labels.builtIn, { year: String(builtYear) }),
          previousCases === 0
            ? labels.noEarlierCases
            : previousCases === 1
              ? labels.earlierCase
              : formatMessage(labels.earlierCases, {
                  count: String(previousCases),
                }),
        ]
          .filter(Boolean)
          .join(" · ")
      )
    }
    case "contractor": {
      if (!step.detail) return null
      const { name, jobsHere, jobsTotal } = step.detail
      const record =
        jobsHere === 1
          ? labels.jobHere
          : jobsHere > 1
            ? formatMessage(labels.jobsHere, { count: String(jobsHere) })
            : formatMessage(labels.jobsTotal, { count: String(jobsTotal) })
      return line(`${name} · ${record}`)
    }
    case "slot":
      return step.detail ? line(format.slot(step.detail)) : null
    case "message":
      if (!step.detail) return null
      return (
        <Bubble
          text={step.detail.text}
          meta={[
            step.detail.sentAt && format.time(step.detail.sentAt),
            step.detail.mode === "simulated" && labels.simulated,
          ]}
        />
      )
    case "confirmation":
      if (!step.detail) return null
      return (
        <Bubble
          incoming
          text={step.detail.reply}
          meta={[step.at && format.time(step.at)]}
        />
      )
    case "work_order": {
      if (!step.detail) return null
      const { costEstimateEur, payer } = step.detail
      return line(
        [
          costEstimateEur &&
            formatMessage(labels.estimate, {
              amount: format.currency(costEstimateEur),
            }),
          labels.payer[payer],
        ]
          .filter(Boolean)
          .join(" · ")
      )
    }
  }
}

function Bubble({
  text,
  meta,
  incoming = false,
}: {
  text: string
  meta: (string | false | undefined)[]
  incoming?: boolean
}) {
  return (
    <div
      className={cn(
        "mt-2 w-fit max-w-[92%] rounded-2xl px-3 py-2 text-[13px] leading-5 whitespace-pre-line",
        styles.bubble,
        incoming
          ? cn("rounded-bl-sm bg-muted", styles.incoming)
          : "ml-auto rounded-br-sm bg-success-surface"
      )}
    >
      {text}
      <span className="mt-1 block text-right text-[11px] tabular-nums text-muted-foreground">
        {meta.filter(Boolean).join(" · ")}
      </span>
    </div>
  )
}

/** True while Cora is working on the request. */
export function useWithCora(request: Request) {
  const dispatch = useCoraDispatch()?.byRequest.get(request.id)
  return Boolean(dispatch && isActive(dispatch))
}

/** Stands in for a request's status while Cora works on it. */
export function CoraChip() {
  const { messages } = useDashboardLocale()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-(--radius-badge) bg-info-surface px-2 py-1 text-xs font-medium text-info">
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full bg-current", styles.live)}
      />
      {messages.cora.withCora}
    </span>
  )
}

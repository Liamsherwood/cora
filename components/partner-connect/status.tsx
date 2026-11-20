import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TRACKING_STEPS, type State } from "@/lib/workflow/states"

const TONE: Record<string, string> = {
  detected: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  offer_sent: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  consent_given: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  ordered: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  confirmed: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  active: "bg-emerald-500/25 text-emerald-900 dark:text-emerald-200",
  closed: "bg-emerald-500/25 text-emerald-900 dark:text-emerald-200",
  rejected: "bg-destructive/15 text-destructive",
}

export function StateBadge({ state }: { state: string }) {
  return (
    <Badge variant="secondary" className={cn(TONE[state])}>
      {state.replace(/_/g, " ")}
    </Badge>
  )
}

/** The "parcel tracking" bar the tenant sees. */
export function Tracking({
  state,
  category,
}: {
  state: State
  category?: string
}) {
  const order = TRACKING_STEPS.map((s) => s.state)
  const reached = state === "closed" ? order.length - 1 : order.indexOf(state)
  const failed =
    state === "declined" ||
    state === "rejected" ||
    state === "no_eligible_offer"
  return (
    <ol className="flex flex-wrap items-center gap-y-2" aria-label="Progress">
      {TRACKING_STEPS.map((s, i) => {
        const done = !failed && i <= reached
        const label =
          s.state === "active" && category === "energy"
            ? "Supply active"
            : s.label
        return (
          <li key={s.state} className="flex items-center">
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs",
                done ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  done ? "bg-primary" : "bg-border"
                )}
                aria-hidden
              />
              {label}
            </span>
            {i < TRACKING_STEPS.length - 1 && (
              <span
                className={cn(
                  "mx-2 h-px w-5",
                  done && i < reached ? "bg-primary" : "bg-border"
                )}
                aria-hidden
              />
            )}
          </li>
        )
      })}
      {failed && (
        <li className="ml-2">
          <StateBadge state={state} />
        </li>
      )}
    </ol>
  )
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  )
}

export function Spinner() {
  return (
    <span
      className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden
    />
  )
}

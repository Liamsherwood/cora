/**
 * Workflow state machine. Agreed names – do not rename without telling the team.
 *
 *   detected → offer_sent → consent_given → ordered → confirmed → active → closed
 *
 * Side exits: no_eligible_offer, declined (tenant), rejected (partner).
 * The names live in ./state-names, shared with the workflow_runs CHECK constraint.
 */
import { WORKFLOW_STATES } from "./state-names"

export const STATES = WORKFLOW_STATES

export type State = (typeof STATES)[number]

export const TRANSITIONS: Record<State, readonly State[]> = {
  detected: ["offer_sent", "no_eligible_offer", "declined"],
  offer_sent: ["consent_given", "declined"],
  consent_given: ["ordered", "declined"],
  ordered: ["confirmed", "active", "rejected"],
  confirmed: ["active", "rejected"],
  active: ["closed"],
  closed: [],
  no_eligible_offer: [],
  declined: [],
  rejected: [],
}

export const TERMINAL: ReadonlySet<State> = new Set([
  "closed",
  "no_eligible_offer",
  "declined",
  "rejected",
])

export function canTransition(from: State, to: State): boolean {
  return TRANSITIONS[from].includes(to)
}

/** States that may move to `to` – used for the atomic conditional UPDATE. */
export function predecessorsOf(to: State): State[] {
  return STATES.filter((s) => TRANSITIONS[s].includes(to))
}

/** Tenant-facing tracking steps (the "DHL" bar). */
export const TRACKING_STEPS: { state: State; label: string }[] = [
  { state: "detected", label: "Move-in detected" },
  { state: "offer_sent", label: "Offer sent" },
  { state: "consent_given", label: "You agreed" },
  { state: "ordered", label: "Ordered" },
  { state: "confirmed", label: "Provider confirmed" },
  { state: "active", label: "Connection live" },
]

export function isState(v: unknown): v is State {
  return typeof v === "string" && (STATES as readonly string[]).includes(v)
}

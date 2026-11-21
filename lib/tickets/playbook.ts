import { addBusinessDays } from "@/lib/time"

import type { TicketClassification } from "./classification"
import type { TicketDetails } from "./details"

/**
 * What staff should do next on a ticket. Plain rules over the classification and the
 * recorded facts, no model: the agent only describes the problem, the next steps and the
 * response target are policy. Targets are our assumption of a typical German property
 * manager's service levels, not a legal deadline.
 */

export const trades = [
  "heatingEngineer",
  "plumber",
  "electrician",
  "dampSpecialist",
  "pestControl",
  "applianceService",
  "liftService",
  "locksmith",
  "caretaker",
] as const

export type Trade = (typeof trades)[number]

/**
 * Who fixes each category. Internet faults the property manager owns are the building's
 * wiring, so an electrician (the tenant's own line is their provider's job). Noise is a
 * matter between neighbours: nobody to commission.
 */
export const tradeFor: Record<TicketClassification["category"], Trade | null> =
  {
    heating: "heatingEngineer",
    plumbing: "plumber",
    electrical: "electrician",
    internet: "electrician",
    damp_mould: "dampSpecialist",
    pests: "pestControl",
    appliance: "applianceService",
    elevator: "liftService",
    access_keys: "locksmith",
    noise: null,
    other: "caretaker",
  }

export type ResponseTarget = "twoHours" | "oneDay" | "threeDays" | "tenDays"

const targets: Record<
  TicketClassification["priority"],
  { target: ResponseTarget; hours?: number; businessDays?: number }
> = {
  emergency: { target: "twoHours", hours: 2 },
  high: { target: "oneDay", hours: 24 },
  normal: { target: "threeDays", businessDays: 3 },
  low: { target: "tenDays", businessDays: 10 },
}

export type NextStep =
  | { kind: "triage" }
  | { kind: "linkTenancy" }
  | { kind: "callResidentNow" }
  /** `done` once a contractor has been booked on the case. */
  | { kind: "commission"; trade: Trade; done: boolean }
  | { kind: "noiseNotice" }
  | { kind: "agreeAccess" }
  | { kind: "informResidents" }
  | { kind: "confirmFixed" }

export type TicketPlan = {
  target: ResponseTarget | null
  /** Exact time for hour targets, a calendar day (Berlin) for business-day targets. */
  due: { at: Date } | { day: string } | null
  overdue: boolean
  steps: NextStep[]
}

type PlanInput = {
  classification: TicketClassification | null
  details: TicketDetails | null
  caseId: string | null
  createdAt: Date
  resolvedAt: Date | null
  /** A contractor is booked: the response target is met. */
  commissioned?: boolean
}

/** "YYYY-MM-DD" of an instant in German local time. */
function berlinDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(at)
}

export function ticketPlan(ticket: PlanInput, at: Date): TicketPlan {
  const { classification, details, caseId, createdAt, resolvedAt } = ticket
  const commissioned = Boolean(ticket.commissioned)
  if (resolvedAt) return { target: null, due: null, overdue: false, steps: [] }

  const steps: NextStep[] = []
  if (!caseId) steps.push({ kind: "linkTenancy" })
  if (!classification) {
    steps.push({ kind: "triage" }, { kind: "confirmFixed" })
    return { target: null, due: null, overdue: false, steps }
  }

  const trade = tradeFor[classification.category]
  if (classification.priority === "emergency")
    steps.push({ kind: "callResidentNow" })
  steps.push(
    trade
      ? { kind: "commission", trade, done: commissioned }
      : { kind: "noiseNotice" }
  )
  if (trade && classification.scope === "unit" && !details?.access)
    steps.push({ kind: "agreeAccess" })
  if (classification.scope === "common") steps.push({ kind: "informResidents" })
  steps.push({ kind: "confirmFixed" })

  const rule = targets[classification.priority]
  if (rule.hours !== undefined) {
    const due = new Date(createdAt.getTime() + rule.hours * 3_600_000)
    return {
      target: rule.target,
      due: { at: due },
      overdue: !commissioned && at > due,
      steps,
    }
  }
  // Counted from the day after the report, so a Saturday report is due like a Monday one.
  const day = addBusinessDays(berlinDay(createdAt), rule.businessDays!)
  return {
    target: rule.target,
    due: { day },
    overdue: !commissioned && berlinDay(at) > day,
    steps,
  }
}

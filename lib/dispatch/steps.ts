/*
 * The steps Cora works through when a property manager hands her a maintenance
 * request. Shared by the engine and the dashboard, so it holds types only.
 */

export const DISPATCH_STEPS = [
  "building",
  "contractor",
  "slot",
  "message",
  "confirmation",
  "work_order",
] as const

export type DispatchStepKey = (typeof DISPATCH_STEPS)[number]
export type DispatchStatus = "working" | "waiting" | "done" | "failed"
export type DispatchPriority = "Routine" | "High" | "Urgent"
export type DispatchError = "no_contractor" | "declined" | "send_failed"

type StepDetails = {
  building: {
    /** The building's heating system or the asset the issue concerns, as recorded. */
    system: string | null
    builtYear: number | null
    /** Earlier cases of the same category at this property. */
    previousCases: number
  }
  contractor: { name: string; jobsHere: number; jobsTotal: number }
  slot: { start: string; end: string }
  message: { text: string; mode: "live" | "simulated"; sentAt?: string }
  confirmation: { reply: string; accepted: boolean }
  work_order: { costEstimateEur: string | null; payer: "weg" | "owner" }
}

export type DispatchStep = {
  [K in DispatchStepKey]: {
    key: K
    status: "pending" | "running" | "done" | "failed"
    /** When the step finished. */
    at?: string
    detail?: StepDetails[K]
    error?: DispatchError
  }
}[DispatchStepKey]

export type DispatchView = {
  id: string
  requestKey: string
  status: DispatchStatus
  steps: DispatchStep[]
}

export function stepOf<K extends DispatchStepKey>(
  steps: DispatchStep[],
  key: K
): Extract<DispatchStep, { key: K }> | undefined {
  return steps.find((s) => s.key === key) as
    Extract<DispatchStep, { key: K }> | undefined
}

export function initialSteps(): DispatchStep[] {
  return DISPATCH_STEPS.map(
    (key) => ({ key, status: "pending" }) as DispatchStep
  )
}

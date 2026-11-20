import type { UnitSnapshot } from "@/lib/centrix/repository"
import type { getRunView, listRuns } from "@/lib/workflow/engine"

/** JSON over the wire: Dates arrive as ISO strings. */
type Jsonified<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonified<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonified<T[K]> }
      : T

export type RunView = Jsonified<Awaited<ReturnType<typeof getRunView>>>
export type RunRow = Jsonified<Awaited<ReturnType<typeof listRuns>>[number]>
export type UnitResponse = Jsonified<{
  snapshot: UnitSnapshot
  workflows: Awaited<ReturnType<typeof listRuns>>
}>
export type UnitRow = {
  id: string
  identifier: string
  property_id: string
  street: string
  city: string | null
}
export type PartnerOrder = {
  id: string
  partner_id: string
  partner_name: string
  product: string
  status: string
  start_date: string
  created_at: string
  received: Record<string, unknown>
  statuses: string[]
}

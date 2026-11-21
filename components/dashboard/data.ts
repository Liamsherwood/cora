import type { PropertySummary } from "@/lib/centrix/portfolio"

export type Property = PropertySummary

/** Seed property ids (data/seed.json) the demo maintenance requests are filed against. */
const seedProperty = {
  dorotheenstrasse: "2bb9ecd8-944b-5bfd-b6e6-4c4f81a4ceb9",
  muensterstrasse: "e236b232-2232-52bc-9255-0875045e36d5",
  koelnerLandstrasse: "d852c1ce-34d8-5c38-bca1-aad1925838ff",
  kaiserswertherStrasse: "8d9eef5a-e224-5c37-b90c-3b8e760a94d3",
  lorettostrasse: "ef23581a-c79f-5b47-b8a0-7043191eefb7",
}

export const priorities = ["Routine", "High", "Urgent"] as const
export type Priority = (typeof priorities)[number]
export type RequestStatus =
  "Open" | "Awaiting vendor" | "Scheduled" | "Resolved"

export type RequestState = {
  id: string
  propertyId: string
  priority: Priority
  status: RequestStatus
}

export type Request = RequestState & { title: string; description: string }

export const demoRequests = [
  {
    id: "heating",
    propertyId: seedProperty.dorotheenstrasse,
    priority: "Urgent",
    status: "Open",
  },
  {
    id: "leak",
    propertyId: seedProperty.muensterstrasse,
    priority: "Urgent",
    status: "Open",
  },
  {
    id: "entry",
    propertyId: seedProperty.koelnerLandstrasse,
    priority: "High",
    status: "Awaiting vendor",
  },
  {
    id: "inspection",
    propertyId: seedProperty.muensterstrasse,
    priority: "Routine",
    status: "Scheduled",
  },
  {
    id: "lighting",
    propertyId: seedProperty.kaiserswertherStrasse,
    priority: "Routine",
    status: "Open",
  },
  {
    id: "intercom",
    propertyId: seedProperty.lorettostrasse,
    priority: "Routine",
    status: "Scheduled",
  },
] as const satisfies readonly RequestState[]

export function activeRequests(requests: Request[]) {
  return requests.filter(({ status }) => status !== "Resolved")
}

export function urgentRequests(requests: Request[]) {
  return requests.filter(
    ({ priority, status }) => priority === "Urgent" && status !== "Resolved"
  )
}

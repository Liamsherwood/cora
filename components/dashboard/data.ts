export const properties = [
  {
    id: "the-linden",
    name: "The Linden",
    address: "Lindenstraße 42, Berlin",
    units: 48,
    occupied: 47,
  },
  {
    id: "rosenhof",
    name: "Rosenhof",
    address: "Rosenstraße 8, Berlin",
    units: 36,
    occupied: 34,
  },
  {
    id: "park-courtyard",
    name: "Park Courtyard",
    address: "Parkstraße 16, Potsdam",
    units: 28,
    occupied: 26,
  },
  {
    id: "uferhaus",
    name: "Uferhaus",
    address: "Uferstraße 24, Berlin",
    units: 20,
    occupied: 20,
  },
]

export type Property = (typeof properties)[number]

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
    propertyId: "the-linden",
    priority: "Urgent",
    status: "Open",
  },
  {
    id: "leak",
    propertyId: "rosenhof",
    priority: "Urgent",
    status: "Open",
  },
  {
    id: "entry",
    propertyId: "park-courtyard",
    priority: "High",
    status: "Awaiting vendor",
  },
  {
    id: "inspection",
    propertyId: "the-linden",
    priority: "Routine",
    status: "Scheduled",
  },
  {
    id: "lighting",
    propertyId: "rosenhof",
    priority: "Routine",
    status: "Open",
  },
  {
    id: "intercom",
    propertyId: "uferhaus",
    priority: "Routine",
    status: "Scheduled",
  },
] as const satisfies readonly RequestState[]

export function activeRequests(requests: Request[]) {
  return requests.filter(({ status }) => status !== "Resolved")
}

export function attentionRequests(requests: Request[]) {
  const open = activeRequests(requests)
  return [
    ...open.filter(({ priority }) => priority === "Urgent"),
    ...open.filter(
      ({ status, priority }) =>
        status === "Awaiting vendor" && priority !== "Urgent"
    ),
  ]
}

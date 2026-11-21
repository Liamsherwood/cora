import type { Messages } from "@/lib/i18n/dictionaries"

import type { getTicket, listTicketRuns } from "./repository"

type Ticket = NonNullable<Awaited<ReturnType<typeof getTicket>>>
type Run = Awaited<ReturnType<typeof listTicketRuns>>[number]
type DemoRun = Pick<
  Run,
  "id" | "agent" | "startedAt" | "ticketChange" | "sendStatus"
>
type DemoMessages = Messages["tickets"]["demo"]
type DemoTicket = Omit<Ticket, "summary" | "createdAt" | "updatedAt"> & {
  summaryKey: keyof DemoMessages["summaries"]
  titleKey?: keyof DemoMessages["titles"]
  runs: [DemoRun, ...DemoRun[]]
}

const tapTicketId = "80000000-0000-4000-8000-000000000001"

const examples: DemoTicket[] = [
  {
    id: "80000400-0000-4000-8000-000000000005",
    summaryKey: "utilityEnquiries",
    titleKey: "utilityEnquiries",
    classification: { category: "other", priority: "low", scope: "unit" },
    caseId: "90000400-0000-4000-8000-000000000005",
    tenantName: "Liam Sherwood",
    propertyAddress: "Musterstraße 12",
    unitIdentifier: "4B",
    resolvedAt: null,
    runs: [
      {
        id: "demo-utility-enquiries-call",
        agent: "cora-voice",
        startedAt: new Date("2026-11-21T08:30:00Z"),
        ticketChange: "opened",
        sendStatus: "returned",
      },
    ],
  },
  {
    id: tapTicketId,
    summaryKey: "tap",
    classification: { category: "plumbing", priority: "normal", scope: "unit" },
    caseId: "90000000-0000-4000-8000-000000000001",
    tenantName: "Liam Sherwood",
    propertyAddress: "Musterstraße 12",
    unitIdentifier: "4B",
    resolvedAt: null,
    runs: [
      {
        id: "demo-whatsapp-intake",
        agent: "cora-whatsapp",
        startedAt: new Date("2026-11-21T08:15:00Z"),
        ticketChange: "opened",
        sendStatus: "accepted",
      },
      {
        id: "demo-whatsapp-follow-up",
        agent: "cora-whatsapp",
        startedAt: new Date("2026-11-21T08:18:00Z"),
        ticketChange: "updated",
        sendStatus: "accepted",
      },
    ],
  },
  {
    id: "80000100-0000-4000-8000-000000000002",
    summaryKey: "heating",
    classification: { category: "heating", priority: "high", scope: "unit" },
    caseId: "90000100-0000-4000-8000-000000000002",
    tenantName: "Jonas Weber",
    propertyAddress: "Musterstraße 12",
    unitIdentifier: "2A",
    resolvedAt: null,
    runs: [
      {
        id: "demo-heating-call",
        agent: "cora-voice",
        startedAt: new Date("2026-11-21T07:52:00Z"),
        ticketChange: "opened",
        sendStatus: "returned",
      },
    ],
  },
  {
    id: "80000200-0000-4000-8000-000000000003",
    summaryKey: "lift",
    classification: { category: "elevator", priority: "high", scope: "common" },
    caseId: null,
    tenantName: null,
    propertyAddress: null,
    unitIdentifier: null,
    resolvedAt: null,
    runs: [
      {
        id: "demo-lift-report",
        agent: "cora-whatsapp",
        startedAt: new Date("2026-11-21T07:30:00Z"),
        ticketChange: "opened",
        sendStatus: "accepted",
      },
    ],
  },
  {
    id: "80000300-0000-4000-8000-000000000004",
    summaryKey: "lighting",
    classification: {
      category: "electrical",
      priority: "normal",
      scope: "common",
    },
    caseId: "90000300-0000-4000-8000-000000000004",
    tenantName: "Mina Keller",
    propertyAddress: "Beispielweg 8",
    unitIdentifier: null,
    resolvedAt: new Date("2026-11-20T15:43:00Z"),
    runs: [
      {
        id: "demo-lighting-call",
        agent: "cora-voice",
        startedAt: new Date("2026-11-20T14:06:00Z"),
        ticketChange: "opened",
        sendStatus: "returned",
      },
    ],
  },
]

export function resolvedDemoTickets(value: string | string[] | undefined) {
  const ids = new Set([value].flat())
  if (ids.has("1")) ids.add(tapTicketId)
  return examples.filter(({ id }) => ids.has(id)).map(({ id }) => id)
}

export function listDemoTickets(
  { summaries, titles }: DemoMessages,
  resolvedIds: string[]
) {
  return examples.map(({ summaryKey, titleKey, runs, ...ticket }) => {
    const [firstRun] = runs
    const lastRun = runs.at(-1) ?? firstRun
    const resolvedAt =
      ticket.resolvedAt ??
      (resolvedIds.includes(ticket.id)
        ? new Date(lastRun.startedAt.getTime() + 12 * 60_000)
        : null)

    return {
      ...ticket,
      title: titleKey ? titles[titleKey] : undefined,
      summary: summaries[summaryKey],
      createdAt: firstRun.startedAt,
      updatedAt: resolvedAt ?? lastRun.startedAt,
      resolvedAt,
    }
  })
}

export function listDemoTicketRuns(ticketId: string): Run[] {
  const ticket = examples.find(({ id }) => id === ticketId)
  return (
    ticket?.runs.map((run) => ({
      ...run,
      model: run.agent === "cora-whatsapp" ? "openai/gpt-5-mini" : null,
      conversationId: null,
      gatewayGenerationId: null,
      classification: ticket.classification,
      replyType: "generated",
    })) ?? []
  )
}

export function listRecentDemoTicketRuns(limit: number) {
  return examples
    .flatMap(({ id }) =>
      listDemoTicketRuns(id).map((run) => ({ ...run, ticketId: id }))
    )
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, limit)
}

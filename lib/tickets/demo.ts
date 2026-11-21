import type { getTicket, listTicketRuns } from "./repository"

export function demoTicket(
  summary: string,
  resolved: boolean
): NonNullable<Awaited<ReturnType<typeof getTicket>>> {
  const lastReport = new Date("2026-11-21T08:18:00Z")
  const resolution = resolved ? new Date("2026-11-21T08:30:00Z") : null

  return {
    id: "80000000-0000-4000-8000-000000000001",
    caseId: "90000000-0000-4000-8000-000000000001",
    summary,
    tenantName: "Lena Hoffmann",
    propertyAddress: "Musterstraße 12",
    unitIdentifier: "4B",
    createdAt: new Date("2026-11-21T08:15:00Z"),
    updatedAt: resolution ?? lastReport,
    resolvedAt: resolution,
  }
}

export const demoTicketRuns: Awaited<ReturnType<typeof listTicketRuns>> = [
  {
    id: "demo-whatsapp-intake",
    agent: "cora-whatsapp",
    model: "openai/gpt-5-mini",
    gatewayGenerationId: null,
    startedAt: new Date("2026-11-21T08:15:00Z"),
    ticketChange: "opened",
    replyType: "generated",
    sendStatus: "accepted",
  },
  {
    id: "demo-whatsapp-follow-up",
    agent: "cora-whatsapp",
    model: "openai/gpt-5-mini",
    gatewayGenerationId: null,
    startedAt: new Date("2026-11-21T08:18:00Z"),
    ticketChange: "updated",
    replyType: "generated",
    sendStatus: "accepted",
  },
]

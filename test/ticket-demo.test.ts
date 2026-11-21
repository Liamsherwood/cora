import { describe, expect, it } from "vitest"

import { ticketRef } from "@/lib/ids"
import en from "@/lib/i18n/en"
import {
  listDemoTicketRuns,
  listDemoTickets,
  listRecentDemoTicketRuns,
  resolvedDemoTickets,
} from "@/lib/tickets/demo"

describe("demo ticket inbox", () => {
  it("provides distinct reports with matching activity on both channels", () => {
    const tickets = listDemoTickets(en.tickets.demo, [])
    expect(tickets).toHaveLength(5)
    expect(new Set(tickets.map(({ id }) => ticketRef(id))).size).toBe(
      tickets.length
    )
    expect(
      new Set(
        tickets.flatMap(({ id }) =>
          listDemoTicketRuns(id).map(({ agent }) => agent)
        )
      )
    ).toEqual(new Set(["cora-whatsapp", "cora-voice"]))

    for (const { id, ticketId } of listRecentDemoTicketRuns(3)) {
      expect(listDemoTicketRuns(ticketId).some((run) => run.id === id)).toBe(
        true
      )
    }
  })

  it("records the outbound call, fibre order and pending electricity offer", () => {
    const [ticket] = listDemoTickets(en.tickets.demo, [])
    expect(ticket).toMatchObject({
      tenantName: "Liam Sherwood",
      title: "Internet & electricity",
      resolvedAt: null,
    })
    expect(ticket.summary).toContain(
      "The Reltix assistant called Liam Sherwood"
    )
    expect(ticket.summary).toContain("ordered Lichtweg Glasfaser’s Fibre 500 plan")
    expect(ticket.summary).toContain("A free 5G router is due by 24 November")
    expect(ticket.summary).toContain(
      "added an electricity offer from the local Stadtwerk to the tenant portal. Liam can accept it there."
    )
    expect(listDemoTicketRuns(ticket.id)).toMatchObject([
      { agent: "cora-voice", ticketChange: "opened" },
    ])
  })

  it("honors the original resolved link without resolving other open examples", () => {
    const demo = en.tickets.demo
    const [utilityEnquiries, tap, heating, lift, lighting] = listDemoTickets(
      demo,
      []
    )
    const resolvedIds = resolvedDemoTickets(["1", heating.id, "unknown"])
    expect(resolvedIds).toEqual([tap.id, heating.id])
    expect(
      listDemoTickets(demo, resolvedIds).map(({ id, resolvedAt }) => [
        id,
        Boolean(resolvedAt),
      ])
    ).toEqual([
      [utilityEnquiries.id, false],
      [tap.id, true],
      [heating.id, true],
      [lift.id, false],
      [lighting.id, true],
    ])
  })
})

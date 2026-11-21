import { describe, expect, it } from "vitest"

import { clipText, mergeDetails, ticketTitle } from "@/lib/tickets/details"
import { ticketPlan } from "@/lib/tickets/playbook"

describe("ticket titles", () => {
  it("tidies what the agent sends into a short inbox title", () => {
    expect(ticketTitle("  „kitchen   tap leaking.“ ")).toBe(
      "Kitchen tap leaking"
    )
    expect(ticketTitle("")).toBeNull()
    expect(ticketTitle(" ... ")).toBeNull()
    expect(ticketTitle(undefined)).toBeNull()
    const long = ticketTitle(
      "Water is coming through the bathroom ceiling from the flat upstairs and dripping onto the floor"
    )!
    expect(long.length).toBeLessThanOrEqual(60)
    expect(long).toBe(
      "Water is coming through the bathroom ceiling from the flat…"
    )
  })

  it("clips on a word boundary", () => {
    expect(clipText("short", 10)).toBe("short")
    expect(clipText("one two three four", 14)).toBe("one two three…")
    expect(clipText("x".repeat(20), 10)).toBe(`${"x".repeat(9)}…`)
  })

  it("merges details without letting a blank erase a fact", () => {
    expect(
      mergeDetails(
        { location: "Kitchen", since: "Monday" },
        { location: "", access: "Evenings" }
      )
    ).toEqual({ location: "Kitchen", since: "Monday", access: "Evenings" })
    expect(mergeDetails(null, { location: "" })).toBeNull()
  })
})

describe("ticket playbook", () => {
  const createdAt = new Date("2026-11-21T08:00:00Z") // Saturday
  const base = { details: null, caseId: "case", createdAt, resolvedAt: null }

  it("puts the resident's safety first in an emergency", () => {
    const plan = ticketPlan(
      {
        ...base,
        classification: {
          category: "plumbing",
          priority: "emergency",
          scope: "unit",
        },
      },
      new Date("2026-11-21T09:00:00Z")
    )
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "callResidentNow",
      "commission",
      "agreeAccess",
      "confirmFixed",
    ])
    expect(plan.steps[1]).toEqual({
      kind: "commission",
      trade: "plumber",
      done: false,
    })
    expect(plan).toMatchObject({
      target: "twoHours",
      due: { at: new Date("2026-11-21T10:00:00Z") },
      overdue: false,
    })
    expect(
      ticketPlan(
        {
          ...base,
          classification: {
            category: "plumbing",
            priority: "emergency",
            scope: "unit",
          },
        },
        new Date("2026-11-21T10:01:00Z")
      ).overdue
    ).toBe(true)
  })

  it("counts working days for routine repairs, from the next business day", () => {
    const plan = ticketPlan(
      {
        ...base,
        details: { access: "Weekdays after 17:00" },
        classification: {
          category: "elevator",
          priority: "normal",
          scope: "common",
        },
      },
      createdAt
    )
    // Reported Saturday: Mon, Tue, Wed.
    expect(plan.due).toEqual({ day: "2026-11-25" })
    expect(plan.steps).toEqual([
      { kind: "commission", trade: "liftService", done: false },
      { kind: "informResidents" },
      { kind: "confirmFixed" },
    ])
  })

  it("has no contractor for noise and asks to link an unmatched sender", () => {
    const plan = ticketPlan(
      {
        ...base,
        caseId: null,
        classification: { category: "noise", priority: "low", scope: "unit" },
      },
      createdAt
    )
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "linkTenancy",
      "noiseNotice",
      "confirmFixed",
    ])
  })

  it("asks staff to triage an unclassified ticket and stops once resolved", () => {
    expect(
      ticketPlan({ ...base, classification: null }, createdAt).steps
    ).toEqual([{ kind: "triage" }, { kind: "confirmFixed" }])
    expect(
      ticketPlan(
        {
          ...base,
          resolvedAt: createdAt,
          classification: {
            category: "heating",
            priority: "high",
            scope: "unit",
          },
        },
        createdAt
      )
    ).toEqual({ target: null, due: null, overdue: false, steps: [] })
  })
})

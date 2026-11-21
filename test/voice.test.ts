import { createHmac } from "node:crypto"

import { and, eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { DB } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { caseRef, nameUuid } from "@/lib/ids"
import {
  getTicket,
  listTicketCalls,
  listTicketRuns,
} from "@/lib/tickets/repository"
import { verifyElevenLabsSignature } from "@/lib/voice/auth"
import {
  findCallerByNameAndStreet,
  findCallerByPhone,
  findCase,
  getCaller,
  openCases,
  phoneDigits,
  reportIssue,
  supportContext,
} from "@/lib/voice/caller"
import { greeting } from "@/lib/voice/greetings"
import { fileTicketInput } from "@/lib/voice/tools"

import { closeDb, expectAppError, LENA, resetDb, UNIT_4B } from "./helpers"

let db: DB
beforeEach(async () => {
  db = await resetDb()
})
afterAll(closeDb)

describe("caller lookup", () => {
  it("normalises phone numbers", () => {
    expect(phoneDigits("+49 172 853 7122")).toBe("491728537122")
    expect(phoneDigits("0049 172 8537122")).toBe("491728537122")
    expect(phoneDigits("0172 8537122")).toBe("491728537122")
  })

  it("recognises a tenant by caller ID, including an upcoming move-in", async () => {
    const c = await findCallerByPhone(db, "+491728537122")
    expect(c?.party_id).toBe(LENA)
    expect(c?.homes[0]).toMatchObject({
      unit_id: UNIT_4B,
      role: "tenant",
      move_in: "2026-12-01",
    })
    expect(await findCallerByPhone(db, "0172 8537122")).not.toBeNull()
    expect(await findCallerByPhone(db, "+49 30 1234567")).toBeNull()
  })

  it("needs the exact name and the street without caller ID", async () => {
    const c = await findCallerByNameAndStreet(
      db,
      "Liam Sherwood",
      "Musterstr. 12"
    )
    expect(c?.party_id).toBe(LENA)
    expect(
      await findCallerByNameAndStreet(db, "Liam Sherwood", "Ackerstraße")
    ).toBeNull()
    expect(
      await findCallerByNameAndStreet(db, "Liam", "Musterstraße")
    ).toBeNull()
  })

  it("gives the agent a value for every variable, known or not", async () => {
    const unknown = await supportContext(db, null)
    expect(unknown.caller_known).toBe("no")
    const known = await supportContext(db, await getCaller(db, LENA))
    expect(known).toMatchObject({
      caller_known: "yes",
      caller_first_name: "Liam",
      unit_id: UNIT_4B,
      move_in_date: "2026-12-01",
      open_cases: "none",
    })
    for (const v of Object.values(known)) expect(typeof v).toBe("string")
    expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort())
  })

  it("greets in the caller's language and always says it is an AI", () => {
    expect(greeting("de", "Lena")).toContain("KI-Assistentin")
    expect(greeting("xx", "Lena")).toContain("AI assistant")
    expect(greeting("de", null)).toContain("AI assistant")
  })
})

describe("cases by voice", () => {
  it("files a case, then finds it among open cases and by reference", async () => {
    const lena = await getCaller(db, LENA)
    const issue = {
      category: "heating",
      priority: "high",
      scope: "unit",
      title: "living room radiator cold.",
      description: "Die Heizung im Wohnzimmer bleibt kalt.",
      summary: "Living room radiator stays cold.",
      location: "Living room",
      since: "Since yesterday evening",
      resident_actions: "Bled the radiator",
      access: "Weekdays after 17:00",
      conversation_id: "conv_test",
    } as const
    const [r, replay] = await Promise.all([
      reportIssue(db, lena, issue),
      reportIssue(db, lena, issue),
    ])
    expect(replay).toEqual(r)
    expect(r.reference).toBe(caseRef(r.case_id))
    expect(r.title).toBe("Living room radiator cold")
    const classification = {
      category: "heating",
      priority: "high",
      scope: "unit",
    }
    expect(await getTicket(db, r.ticket_id)).toMatchObject({
      caseId: r.case_id,
      title: "Living room radiator cold",
      classification,
      summary: issue.summary,
      details: {
        description: issue.description,
        location: "Living room",
        since: "Since yesterday evening",
        residentActions: "Bled the radiator",
        access: "Weekdays after 17:00",
        language: "de",
      },
      tenantName: "Liam Sherwood",
      unitIdentifier: "4B",
    })
    expect(await listTicketRuns(db, r.ticket_id)).toMatchObject([
      {
        agent: "cora-voice",
        conversationId: "conv_test",
        classification,
        ticketChange: "opened",
        sendStatus: "returned",
      },
    ])

    const [row] = await db
      .select()
      .from(t.cases)
      .where(eq(t.cases.id, r.case_id))
    expect(row).toMatchObject({
      unitId: UNIT_4B,
      reporterPartyId: LENA,
      status: "open",
    })
    const events = await db
      .select()
      .from(t.events)
      .where(
        and(
          eq(t.events.type, "case.created"),
          sql`${t.events.payload}->>'conversation_id' = ${issue.conversation_id}`
        )
      )
    expect(
      events.map((e) => (e.payload as { case_id: string }).case_id)
    ).toEqual([r.case_id])

    const open = await openCases(db, lena)
    expect(open[0]).toMatchObject({
      reference: r.reference,
      summary: "Living room radiator cold",
      description: issue.description,
    })
    expect((await findCase(db, lena, r.reference.toLowerCase())).case_id).toBe(
      r.case_id
    )
    expect((await supportContext(db, lena)).open_cases).toContain(r.reference)
  })

  it("puts a common-area case on the building, not the flat", async () => {
    const lena = await getCaller(db, LENA)
    const r = await reportIssue(db, lena, {
      category: "elevator",
      priority: "emergency",
      scope: "common",
      description: "Der Aufzug steckt fest.",
      summary: "Lift stuck.",
    })
    expect(r.next_step).toContain("112")
    const [row] = await db
      .select()
      .from(t.cases)
      .where(eq(t.cases.id, r.case_id))
    expect(row?.unitId).toBeNull()
  })

  it("refuses a unit the caller doesn't live in or own", async () => {
    const lena = await getCaller(db, LENA)
    const other = await db.select().from(t.units).limit(5)
    const foreign = other.find((u) => u.id !== UNIT_4B)!
    await expectAppError(
      reportIssue(db, lena, {
        unit_id: foreign.id,
        category: "noise",
        priority: "low",
        scope: "unit",
        description: "Laute Nachbarn.",
        summary: "Noisy neighbours.",
      }),
      403
    )
  })
})

describe("file_maintenance_ticket arguments", () => {
  const base = {
    party_id: LENA,
    category: "plumbing",
    priority: "normal",
    description: "Der Wasserhahn in der Küche tropft.",
    summary: "Kitchen tap dripping.",
  }

  it("treats blank and null optionals as missing and drops unknown keys", () => {
    const parsed = fileTicketInput.parse({
      ...base,
      unit_id: "",
      scope: "",
      title: "",
      since: null,
      access: "   ",
      conversation_id: "",
      urgency_note: "from a newer tool schema",
    })
    expect(parsed).toEqual({ ...base, scope: "unit" })
  })

  it("clips long text instead of losing the report", () => {
    const parsed = fileTicketInput.parse({
      ...base,
      title: "Kitchen tap ".repeat(20),
      description: "Tropft. ".repeat(300),
    })
    expect(parsed.title!.length).toBeLessThanOrEqual(120)
    expect(parsed.description.length).toBeLessThanOrEqual(1000)
    expect(parsed.description.endsWith("…")).toBe(true)
  })

  it("still refuses identifiers that don't come from call context", () => {
    expect(fileTicketInput.safeParse({ ...base, party_id: "" }).success).toBe(
      false
    )
    expect(fileTicketInput.safeParse({ ...base, unit_id: "4B" }).success).toBe(
      false
    )
    expect(
      fileTicketInput.safeParse({ ...base, category: "roof" }).success
    ).toBe(false)
  })
})

describe("call recap on the ticket", () => {
  it("finds the post-call summary by conversation ID", async () => {
    await db.insert(t.events).values({
      id: nameUuid("elevenlabs-call:conv_recap"),
      type: "call.completed",
      unitId: UNIT_4B,
      partyId: LENA,
      occurredAt: new Date("2026-11-21T09:30:00Z"),
      payload: {
        conversation_id: "conv_recap",
        summary: "Resident reported a dripping kitchen tap.",
        call_successful: "success",
        duration_secs: 142,
      },
    })
    expect(await listTicketCalls(db, ["conv_recap", "conv_other"])).toEqual([
      {
        conversationId: "conv_recap",
        summary: "Resident reported a dripping kitchen tap.",
        successful: true,
        durationSecs: 142,
        endedAt: new Date("2026-11-21T09:30:00Z"),
      },
    ])
    expect(await listTicketCalls(db, [])).toEqual([])
  })
})

describe("post-call webhook signature", () => {
  const secret = "whsec_test"
  const body = '{"type":"post_call_transcription"}'
  const sign = (ts: number) =>
    `t=${ts},v0=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`

  it("accepts a fresh, correct signature and rejects the rest", () => {
    const now = 1_795_000_000_000
    const ts = now / 1000
    expect(() =>
      verifyElevenLabsSignature(sign(ts), body, secret, now)
    ).not.toThrow()
    expect(() =>
      verifyElevenLabsSignature(sign(ts), `${body} `, secret, now)
    ).toThrow()
    expect(() =>
      verifyElevenLabsSignature(sign(ts - 3600), body, secret, now)
    ).toThrow()
    expect(() => verifyElevenLabsSignature(null, body, secret, now)).toThrow()
    expect(() =>
      verifyElevenLabsSignature(sign(ts), body, undefined, now)
    ).toThrow()
  })
})

import { createHmac } from "node:crypto"

import { and, eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { DB } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { caseRef } from "@/lib/ids"
import { getTicket, listTicketRuns } from "@/lib/tickets/repository"
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
      "Lena Hoffmann",
      "Musterstr. 12"
    )
    expect(c?.party_id).toBe(LENA)
    expect(
      await findCallerByNameAndStreet(db, "Lena Hoffmann", "Ackerstraße")
    ).toBeNull()
    expect(
      await findCallerByNameAndStreet(db, "Lena", "Musterstraße")
    ).toBeNull()
  })

  it("gives the agent a value for every variable, known or not", async () => {
    const unknown = await supportContext(db, null)
    expect(unknown.caller_known).toBe("no")
    const known = await supportContext(db, await getCaller(db, LENA))
    expect(known).toMatchObject({
      caller_known: "yes",
      caller_first_name: "Lena",
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
      description: "Die Heizung im Wohnzimmer bleibt kalt.",
      summary: "Living room radiator stays cold.",
      conversation_id: "conv_test",
    } as const
    const [r, replay] = await Promise.all([
      reportIssue(db, lena, issue),
      reportIssue(db, lena, issue),
    ])
    expect(replay).toEqual(r)
    expect(r.reference).toBe(caseRef(r.case_id))
    const classification = {
      category: "heating",
      priority: "high",
      scope: "unit",
    }
    expect(await getTicket(db, r.ticket_id)).toMatchObject({
      caseId: r.case_id,
      classification,
      summary: issue.summary,
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
      summary: "Living room radiator stays cold.",
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

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { DB } from "@/lib/db"
import { newId } from "@/lib/ids"
import { startCall } from "@/lib/voice/elevenlabs"
import {
  answerWebCall,
  bindWebCall,
  voiceMode,
  webCallState,
} from "@/lib/voice/web-call"
import {
  getRunView,
  triggerEvent,
  voiceThreadMatches,
} from "@/lib/workflow/engine"

import { closeDb, expectAppError, LENA, resetDb, UNIT_4B } from "./helpers"

let db: DB
beforeEach(async () => {
  db = await resetDb()
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key")
  vi.stubEnv("ELEVENLABS_AGENT_ID", "agent_test")
  vi.stubEnv("ELEVENLABS_PHONE_NUMBER_ID", "")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
afterAll(closeDb)

async function fibreRun() {
  const ev = await triggerEvent(db, {
    id: newId(),
    type: "tenant.move_in",
    unit_id: UNIT_4B,
    party_id: LENA,
    payload: { move_in_date: "2026-12-01" },
  })
  return ev.runs.find((r) => r.partner_slug === "example_fibre")!.id
}

describe("browser call (no phone number in ElevenLabs)", () => {
  it("picks the mode from the configured settings", () => {
    expect(voiceMode()).toBe("web")
    vi.stubEnv("ELEVENLABS_PHONE_NUMBER_ID", "phnum_1")
    expect(voiceMode()).toBe("phone")
    vi.stubEnv("ELEVENLABS_API_KEY", "")
    expect(voiceMode()).toBe("simulated")
  })

  it("rings in the portal, binds the answered call once, and only that call can decide", async () => {
    const runId = await fibreRun()
    expect(await startCall(db, runId)).toEqual({ mode: "web" })
    expect((await getRunView(db, runId)).run.state).toBe("offer_sent")
    expect(await webCallState(db, runId)).toBe("ringing")
    // Ringing is not a call yet: the decision tool refuses.
    expect(await voiceThreadMatches(db, runId, "conv_1")).toBe(false)

    const fetchMock = vi.fn(async (_url: string | URL | Request) =>
      Response.json({ signed_url: "wss://example.test/signed" })
    )
    vi.stubGlobal("fetch", fetchMock)
    const session = await answerWebCall(db, runId)
    expect(session.signed_url).toBe("wss://example.test/signed")
    expect(session.dynamic_variables).toMatchObject({
      call_purpose: "move_in_offer",
      workflow_id: runId,
      tenant_first_name: "Lena",
    })
    expect(session.first_message).toContain("Lena")
    expect(String(fetchMock.mock.calls[0]![0])).toContain("agent_id=agent_test")

    await bindWebCall(db, runId, "conv_answered_1")
    expect(await webCallState(db, runId)).toBe("connected")
    expect(await voiceThreadMatches(db, runId, "conv_answered_1")).toBe(true)
    expect(await voiceThreadMatches(db, runId, "conv_other")).toBe(false)

    // Same id again is fine; a second tab with another call is refused.
    await bindWebCall(db, runId, "conv_answered_1")
    await expectAppError(bindWebCall(db, runId, "conv_second_tab"), 409)
    await expectAppError(answerWebCall(db, runId), 409)
  })

  it("rejects malformed conversation ids and fails cleanly when ElevenLabs refuses", async () => {
    const runId = await fibreRun()
    await startCall(db, runId)
    await expectAppError(bindWebCall(db, runId, "x"), 400)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ detail: "nope" }, { status: 401 }))
    )
    await expectAppError(answerWebCall(db, runId), 502)
    expect(await webCallState(db, runId)).toBe("ringing")
  })
})

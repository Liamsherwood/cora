"use client"

import type { Conversation } from "@elevenlabs/client"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Phase = "ringing" | "connecting" | "live" | "ended" | "failed"
type Line = { who: "Cora" | "You"; text: string }

/**
 * Cora's call to the tenant, answered in the portal (browser call). Same ElevenLabs
 * agent, context and tools as a phone call; the tenant's yes or no goes through the
 * decision tool and the page updates as the workflow moves on.
 */
export function WebCall({
  runId,
  partnerName,
  initialState,
}: {
  runId: string
  partnerName: string
  initialState: "ringing" | "connected"
}) {
  const router = useRouter()
  const conversation = useRef<Conversation | null>(null)
  const [phase, setPhase] = useState<Phase>(
    initialState === "ringing" ? "ringing" : "ended"
  )
  const [speaking, setSpeaking] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)

  // Hang up if the tenant leaves the page mid-call.
  useEffect(() => () => void conversation.current?.endSession(), [])

  async function answer() {
    setPhase("connecting")
    setError(null)
    try {
      // Ask for the microphone first, so a refusal is a clear message, not a dead call.
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const res = await fetch(`/api/voice/web-call/${runId}/answer`, {
        method: "POST",
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message ?? "The call couldn't start.")
      const { Conversation } = await import("@elevenlabs/client")
      conversation.current = await Conversation.startSession({
        signedUrl: body.signed_url,
        dynamicVariables: body.dynamic_variables,
        overrides: {
          agent: { firstMessage: body.first_message, language: body.language },
        },
        onConnect: ({ conversationId }) => {
          setPhase("live")
          void fetch(`/api/voice/web-call/${runId}/connected`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ conversation_id: conversationId }),
          })
        },
        onMessage: ({ message, source }) =>
          setLines((l) =>
            [
              ...l,
              { who: source === "ai" ? "Cora" : "You", text: message } as Line,
            ].slice(-6)
          ),
        onModeChange: ({ mode }) => setSpeaking(mode === "speaking"),
        onDisconnect: () => {
          conversation.current = null
          setPhase((p) => (p === "failed" ? p : "ended"))
          router.refresh()
        },
        onError: (message) => {
          setError(message)
          setPhase("failed")
        },
      })
    } catch (e) {
      const message =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser to talk to Cora."
          : e instanceof Error
            ? e.message
            : "The call couldn't start."
      setError(message)
      setPhase("failed")
    }
  }

  async function hangUp() {
    await conversation.current?.endSession()
  }

  if (phase === "ended" && lines.length === 0) return null

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle>
          {phase === "ringing" && "Cora is calling you"}
          {phase === "connecting" && "Connecting…"}
          {phase === "live" &&
            (speaking ? "Cora is speaking" : "Cora is listening")}
          {phase === "ended" && "Call ended"}
          {phase === "failed" && "Call not connected"}
        </CardTitle>
        <CardDescription>
          {phase === "ringing"
            ? `About internet for your move-in with ${partnerName}. Cora is your property manager's AI assistant.`
            : phase === "failed"
              ? error
              : "You can also decide with the buttons below at any time."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {lines.length > 0 && (
          <div className="space-y-1 text-sm">
            {lines.map((l, i) => (
              <p key={i}>
                <span className="text-muted-foreground">{l.who}: </span>
                {l.text}
              </p>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          {(phase === "ringing" || phase === "failed") && (
            <Button onClick={answer}>
              {phase === "failed" ? "Try again" : "Answer"}
            </Button>
          )}
          {(phase === "connecting" || phase === "live") && (
            <Button variant="destructive" onClick={hangUp}>
              Hang up
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

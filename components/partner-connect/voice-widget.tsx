"use client"

import { useEffect } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/**
 * Same agent as the phone call, embedded in the portal (fallback if telephony is
 * unavailable, and the "call continues in the portal" bonus). The context is rendered
 * on the server; this component only loads the ElevenLabs widget script.
 */
export function VoiceWidget({
  agentId,
  dynamicVariables,
  firstMessage,
  language,
}: {
  agentId: string
  dynamicVariables: Record<string, string>
  firstMessage?: string
  language?: string
}) {
  useEffect(() => {
    if (document.querySelector("script[data-elevenlabs-widget]")) return
    const s = document.createElement("script")
    s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed@0.10.0"
    s.async = true
    s.dataset.elevenlabsWidget = "1"
    document.body.appendChild(s)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prefer to talk?</CardTitle>
        <CardDescription>
          Our assistant knows your offer already. Just say yes or ask questions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <elevenlabs-convai
          agent-id={agentId}
          dynamic-variables={JSON.stringify(dynamicVariables)}
          override-first-message={firstMessage}
          override-language={language}
        ></elevenlabs-convai>
      </CardContent>
    </Card>
  )
}

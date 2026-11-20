"use client"

import { use, useEffect, useState } from "react"

import {
  api,
  day,
  eur,
  time,
  useAction,
  usePoll,
} from "@/components/partner-connect/client"
import {
  ErrorText,
  Spinner,
  StateBadge,
  Tracking,
} from "@/components/partner-connect/status"
import type { RunRow, RunView } from "@/components/partner-connect/types"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  address: "New address",
  move_in_date: "Move-in date",
  floor: "Floor",
  unit_size_sqm: "Flat size",
  meter_number: "Electricity meter number",
}

export default function PortalPage({ params }: PageProps<"/portal/[partyId]">) {
  const { partyId } = use(params)
  const runs = usePoll<RunRow[]>(
    `/api/workflows?party_id=${encodeURIComponent(partyId)}`,
    2000
  )
  // The tenant only sees a workflow once centrix has actually reached out.
  const visible = (runs.data ?? []).filter(
    (r) => r.state !== "detected" && r.state !== "no_eligible_offer"
  )

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Your move-in</h1>
        <p className="text-sm text-muted-foreground">
          Everything for your new flat in one place. Managed by reltix.
        </p>
      </div>
      <ErrorText>{runs.error}</ErrorText>
      {runs.data && visible.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nothing to do right now. We&apos;ll message you as soon as
              something needs your OK.
            </p>
          </CardContent>
        </Card>
      )}
      {visible.map((r) => (
        <OfferCard key={r.id} runId={r.id} />
      ))}
      <VoiceWidget
        runId={visible.find((r) => r.state === "offer_sent")?.id ?? null}
      />
    </div>
  )
}

function OfferCard({ runId }: { runId: string }) {
  const view = usePoll<RunView>(`/api/workflows/${runId}`)
  const action = useAction()
  const v = view.data
  if (!v || !v.offer) return null
  const o = v.offer
  const busy = action.pending !== null

  const post = (key: string, path: string, body: unknown) =>
    action.run(key, async () => {
      await api(`/api/workflows/${runId}/${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      })
      await view.refresh()
    })

  const consentActive = v.consent && !v.consent.revokedAt

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {o.category === "energy" ? "Electricity" : "Internet"}
        </CardTitle>
        <CardDescription>
          {o.partner_name}
          {o.description ? ` · ${o.description}` : ""}
        </CardDescription>
        <CardAction>
          <StateBadge state={v.run.state} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tracking state={v.run.state} category={o.category} />

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">{o.product}</p>
          <p className="text-right">
            <span className="text-lg font-semibold">
              {eur(o.monthly_price_cents)}
            </span>
            <span className="text-sm text-muted-foreground">
              /month · {o.contract_months} months
            </span>
          </p>
        </div>
        <p className="text-sm">
          {o.on_time
            ? `Live on ${day(o.start_date)}, your move-in day.`
            : `Live from ${day(o.start_date)}.${o.bridge ? ` Until then: ${o.bridge.product}, delivered by ${day(o.bridge.ready_by)}.` : ""}`}
        </p>

        {v.run.state === "offer_sent" && (
          <div className="space-y-3 border bg-muted/50 p-3">
            <p className="text-sm font-medium">
              If you agree, we share only this with {o.partner_name}:
            </p>
            <ul className="grid grid-cols-2 gap-x-4 text-sm text-muted-foreground">
              {o.required_context.map((f) => (
                <li key={f}>· {FIELD_LABELS[f] ?? f}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Purpose: {o.purpose}. Nothing else (rent, owner, other residents)
              leaves reltix. You can withdraw consent any time.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  post("accept", "accept", { channel: "portal", consent: true })
                }
                disabled={busy}
              >
                {action.pending === "accept" && <Spinner />}
                Agree &amp; order
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  post("decline", "decline", { channel: "portal" })
                }
                disabled={busy}
              >
                {action.pending === "decline" && <Spinner />}
                No thanks
              </Button>
            </div>
          </div>
        )}
        <ErrorText>{action.error}</ErrorText>

        <div className="space-y-2">
          {v.messages
            .filter((m) => m.role !== "system")
            .map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  m.role === "tenant" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] px-3 py-2 text-sm",
                    m.role === "tenant"
                      ? "bg-primary text-primary-foreground"
                      : m.role === "partner"
                        ? "bg-emerald-500/10"
                        : "bg-muted"
                  )}
                >
                  <p>{m.content}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-[11px]",
                      m.role === "tenant"
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    )}
                  >
                    {m.role === "agent" ? "reltix assistant" : m.role} ·{" "}
                    {time(m.sentAt)}
                  </p>
                </div>
              </div>
            ))}
        </div>

        {consentActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              post("revoke", "revoke-consent", { channel: "portal" })
            }
            disabled={busy}
          >
            {action.pending === "revoke" && <Spinner />}
            Withdraw consent
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Same agent as the phone call, embedded in the portal (fallback if telephony is
 * unavailable, and the "call continues in the portal" bonus). Only rendered when an
 * agent id is configured.
 */
function VoiceWidget({ runId }: { runId: string | null }) {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID
  const [vars, setVars] = useState<string | null>(null)

  useEffect(() => {
    if (!agentId || !runId) return
    let cancelled = false
    api<Record<string, string>>(`/api/voice/context/${runId}`)
      .then((v) => !cancelled && setVars(JSON.stringify(v)))
      .catch(() => !cancelled && setVars(null))
    if (!document.querySelector("script[data-elevenlabs-widget]")) {
      const s = document.createElement("script")
      s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed@0.10.0"
      s.async = true
      s.dataset.elevenlabsWidget = "1"
      document.body.appendChild(s)
    }
    return () => {
      cancelled = true
    }
  }, [agentId, runId])

  if (!agentId || !runId || !vars) return null
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
          dynamic-variables={vars}
        ></elevenlabs-convai>
      </CardContent>
    </Card>
  )
}

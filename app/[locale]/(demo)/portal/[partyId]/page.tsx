import { notFound } from "next/navigation"
import { connection } from "next/server"

import {
  acceptOfferAction,
  declineOfferAction,
  revokeConsentAction,
} from "@/app/[locale]/(demo)/actions"
import { ActionButton } from "@/components/partner-connect/action-button"
import { AutoRefresh } from "@/components/partner-connect/auto-refresh"
import { day, eur, time } from "@/components/partner-connect/format"
import { StateBadge, Tracking } from "@/components/partner-connect/status"
import { VoiceWidget } from "@/components/partner-connect/voice-widget"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getParty } from "@/lib/centrix/repository"
import { getDb } from "@/lib/db"
import { cn } from "@/lib/utils"
import { buildDynamicVariables } from "@/lib/voice/elevenlabs"
import { getRunView, listRuns } from "@/lib/workflow/engine"

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

type RunView = Awaited<ReturnType<typeof getRunView>>

/** The tenant portal. No auth yet (demo): production would use a signed link per tenant. */
export default async function PortalPage({
  params,
}: PageProps<"/[locale]/portal/[partyId]">) {
  await connection()
  const { partyId } = await params
  const db = getDb()
  const [party, runs] = await Promise.all([
    getParty(db, partyId),
    listRuns(db, { partyId }),
  ])
  if (!party) notFound()

  // The tenant only sees a workflow once centrix has actually reached out.
  const visible = runs.filter(
    (r) => r.state !== "detected" && r.state !== "no_eligible_offer"
  )
  const views = await Promise.all(visible.map((r) => getRunView(db, r.id)))

  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID
  const talkAbout = views.find((v) => v.run.state === "offer_sent")
  const voiceContext =
    agentId && talkAbout
      ? await buildDynamicVariables(db, talkAbout.run.id)
      : null

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <AutoRefresh />
      <div>
        <h1 className="text-lg font-semibold">Your move-in</h1>
        <p className="text-sm text-muted-foreground">
          Everything for your new flat in one place. Managed by reltix.
        </p>
      </div>
      {views.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nothing to do right now. We&apos;ll message you as soon as
              something needs your OK.
            </p>
          </CardContent>
        </Card>
      )}
      {views.map((v) =>
        v.offer ? <OfferCard key={v.run.id} view={v} /> : null
      )}
      {agentId && voiceContext && (
        <VoiceWidget agentId={agentId} dynamicVariables={voiceContext} />
      )}
    </div>
  )
}

function OfferCard({ view: v }: { view: RunView }) {
  const o = v.offer!
  const runId = v.run.id
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
              <ActionButton action={acceptOfferAction.bind(null, runId)}>
                Agree &amp; order
              </ActionButton>
              <ActionButton
                variant="outline"
                action={declineOfferAction.bind(null, runId)}
              >
                No thanks
              </ActionButton>
            </div>
          </div>
        )}

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
          <div className="flex flex-wrap">
            <ActionButton
              variant="ghost"
              size="sm"
              action={revokeConsentAction.bind(null, runId)}
            >
              Withdraw consent
            </ActionButton>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

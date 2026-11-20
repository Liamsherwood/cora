"use client";

import { use, useEffect, useState } from "react";
import { api, day, eur, time, useAction, usePoll } from "@/components/client";
import { Button, Card, ErrorText, StateBadge, Tracking } from "@/components/ui";
import type { RunRow, RunView } from "@/components/types";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  address: "New address",
  move_in_date: "Move-in date",
  floor: "Floor",
  unit_size_sqm: "Flat size",
  meter_number: "Electricity meter number",
};

export default function PortalPage({ params }: { params: Promise<{ partyId: string }> }) {
  const { partyId } = use(params);
  const runs = usePoll<RunRow[]>(`/api/workflows?party_id=${encodeURIComponent(partyId)}`, 2000);
  const visible = (runs.data ?? []).filter((r) => r.state !== "detected" && r.state !== "no_eligible_offer");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Your move-in</h1>
        <p className="text-sm text-muted">Everything for your new flat in one place. Managed by reltix.</p>
      </div>
      <ErrorText>{runs.error}</ErrorText>
      {runs.data && visible.length === 0 && (
        <Card><p className="text-sm text-muted">Nothing to do right now. We&apos;ll message you as soon as something needs your OK.</p></Card>
      )}
      {visible.map((r) => <OfferCard key={r.id} runId={r.id} />)}
      <VoiceWidget runId={visible.find((r) => r.state === "offer_sent")?.id ?? null} />
    </div>
  );
}

function OfferCard({ runId }: { runId: string }) {
  const view = usePoll<RunView>(`/api/workflows/${runId}`);
  const action = useAction();
  const v = view.data;
  if (!v || !v.offer) return null;
  const o = v.offer;

  const accept = () =>
    action.run("accept", async () => {
      await api(`/api/workflows/${runId}/accept`, { method: "POST", body: JSON.stringify({ channel: "portal", consent: true }) });
      await view.refresh();
    });
  const decline = () =>
    action.run("decline", async () => {
      await api(`/api/workflows/${runId}/decline`, { method: "POST", body: JSON.stringify({ channel: "portal" }) });
      await view.refresh();
    });

  return (
    <Card title={o.category === "energy" ? "Electricity" : "Internet"} aside={<StateBadge state={v.run.state} />}>
      <Tracking state={v.run.state} category={o.category} />

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-semibold">{o.product}</p>
          <p className="text-sm text-muted">{o.partner_name}{o.description ? ` · ${o.description}` : ""}</p>
        </div>
        <p className="text-right">
          <span className="text-lg font-semibold">{eur(o.monthly_price_cents)}</span>
          <span className="text-sm text-muted">/month · {o.contract_months} months</span>
        </p>
      </div>
      <p className="mt-2 text-sm">
        {o.on_time
          ? `Live on ${day(o.start_date)}, your move-in day.`
          : `Live from ${day(o.start_date)}.${o.bridge ? ` Until then: ${o.bridge.product}, delivered by ${day(o.bridge.ready_by)}.` : ""}`}
      </p>

      {v.run.state === "offer_sent" && (
        <div className="mt-4 rounded-lg border border-line bg-paper p-3">
          <p className="text-sm font-medium">If you agree, we share only this with {o.partner_name}:</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 text-sm text-muted">
            {o.required_context.map((f) => <li key={f}>· {FIELD_LABELS[f] ?? f}</li>)}
          </ul>
          <p className="mt-2 text-xs text-muted">Purpose: {o.purpose}. Nothing else (rent, owner, other residents) leaves reltix. You can withdraw consent any time.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={accept} busy={action.pending === "accept"} disabled={action.pending !== null}>Agree &amp; order</Button>
            <Button variant="secondary" onClick={decline} busy={action.pending === "decline"} disabled={action.pending !== null}>No thanks</Button>
          </div>
          <div className="mt-2"><ErrorText>{action.error}</ErrorText></div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {v.messages.filter((m) => m.role !== "system").map((m) => (
          <div key={m.id} className={`flex ${m.role === "tenant" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "tenant" ? "bg-brand text-white" : m.role === "partner" ? "bg-emerald-50" : "bg-paper"}`}>
              <p>{m.content}</p>
              <p className={`mt-0.5 text-[11px] ${m.role === "tenant" ? "text-white/70" : "text-muted"}`}>{m.role === "agent" ? "reltix assistant" : m.role} · {time(m.sentAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Same agent as the phone call, embedded in the portal (fallback if telephony is unavailable,
 * and the "call continues in the portal" bonus). Only rendered when an agent id is configured.
 */
function VoiceWidget({ runId }: { runId: string | null }) {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const [vars, setVars] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId || !runId) return;
    let cancelled = false;
    api<Record<string, string>>(`/api/voice/context/${runId}`)
      .then((v) => !cancelled && setVars(JSON.stringify(v)))
      .catch(() => !cancelled && setVars(null));
    if (!document.querySelector("script[data-elevenlabs-widget]")) {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
      s.async = true;
      s.dataset.elevenlabsWidget = "1";
      document.body.appendChild(s);
    }
    return () => {
      cancelled = true;
    };
  }, [agentId, runId]);

  if (!agentId || !runId || !vars) return null;
  return (
    <Card title="Prefer to talk?">
      <p className="mb-2 text-sm text-muted">Our assistant knows your offer already. Just say yes or ask questions.</p>
      {/* @ts-expect-error custom element provided by the ElevenLabs widget script */}
      <elevenlabs-convai agent-id={agentId} dynamic-variables={vars}></elevenlabs-convai>
    </Card>
  );
}

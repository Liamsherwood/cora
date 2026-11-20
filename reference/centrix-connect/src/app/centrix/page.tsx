"use client";

import { useState } from "react";
import Link from "next/link";
import { api, day, eur, time, useAction, usePoll } from "@/components/client";
import { Button, Card, ErrorText, StateBadge, Tracking } from "@/components/ui";
import type { RunView, UnitResponse } from "@/components/types";

type UnitRow = { id: string; identifier: string; street: string; city: string };

export default function CentrixPage() {
  const units = usePoll<UnitRow[]>("/api/centrix/units", 10_000);
  const [unitId, setUnitId] = useState("unit_4b");
  const unit = usePoll<UnitResponse>(`/api/centrix/units/${unitId}`);
  const [runId, setRunId] = useState<string | null>(null);
  const action = useAction();

  const snapshot = unit.data?.snapshot;
  const runs = unit.data?.workflows ?? [];
  const selectedRun = runId && runs.some((r) => r.id === runId) ? runId : runs[0]?.id ?? null;

  const fireMoveIn = () =>
    action.run("event", async () => {
      if (!snapshot?.tenant) throw { message: "This unit has no tenant." };
      await api("/api/centrix/events", {
        method: "POST",
        body: JSON.stringify({
          // Deterministic id: firing the same move-in twice returns the existing runs instead of
          // starting a second flow (and a second order) for the same tenant.
          id: `move_in_${unitId}_${snapshot.tenant.move_in}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64),
          event: "tenant.move_in",
          unit_id: unitId,
          contact_id: snapshot.tenant.contact_id,
          data: { move_in_date: snapshot.tenant.move_in },
        }),
      });
      await unit.refresh();
    });

  const reset = () =>
    action.run("reset", async () => {
      await api("/api/demo/reset", { method: "POST" });
      setRunId(null);
      await unit.refresh();
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-2">
        <h1 className="text-xs font-semibold uppercase tracking-wide text-muted">Units</h1>
        {units.data?.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => {
              setUnitId(u.id);
              setRunId(null);
            }}
            className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${u.id === unitId ? "border-brand bg-brand-soft" : "border-line bg-white hover:bg-paper"}`}
          >
            <span className="font-medium">{u.identifier}</span> <span className="text-muted">· {u.street}</span>
          </button>
        ))}
        <div className="pt-4">
          <Button variant="ghost" onClick={reset} busy={action.pending === "reset"}>Reset demo data</Button>
        </div>
      </aside>

      <div className="space-y-4">
        <ErrorText>{unit.error || action.error}</ErrorText>
        {snapshot && (
          <Card
            title={`Unit ${snapshot.unit.identifier} · ${snapshot.property.address}`}
            aside={<Button onClick={fireMoveIn} busy={action.pending === "event"} disabled={!snapshot.tenant}>Fire event: tenant.move_in</Button>}
          >
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <Info k="Tenant" v={snapshot.tenant?.name ?? "–"} />
              <Info k="Move-in" v={day(snapshot.tenant?.move_in)} />
              <Info k="Owner" v={snapshot.owner?.name ?? "–"} />
              <Info k="WEG" v={snapshot.property.is_weg ? "yes" : "no"} />
              <Info k="Size" v={`${snapshot.unit.size_sqm ?? "–"} m² · ${snapshot.unit.rooms ?? "–"} rooms`} />
              <Info k="Heating" v={snapshot.property.heating ?? "–"} />
              <Info k="Energy class" v={snapshot.property.energy_certificate.class ?? "–"} />
              <Info k="Meter" v={snapshot.unit.meters[0]?.number ?? "–"} />
            </dl>
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Service contracts on this unit</h3>
              {snapshot.service_contracts.length === 0 ? (
                <p className="text-sm text-muted">None yet. Fire the move-in event to start.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {snapshot.service_contracts.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <StateBadge state={c.status === "active" ? "active" : "confirmed"} />
                      <span className="font-medium">{c.product}</span>
                      <span className="text-muted">· {c.partnerName} · {eur(c.monthlyPriceCents)}/mo · from {day(c.startDate)}</span>
                      <span className="text-xs text-muted">consent via {c.consent.channel}: {c.consent.data_shared.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}

        {runs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {runs.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRunId(r.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${r.id === selectedRun ? "border-brand bg-brand-soft" : "border-line bg-white"}`}
              >
                {r.partnerId} <StateBadge state={r.state} />
              </button>
            ))}
          </div>
        )}
        {selectedRun && <RunPanel runId={selectedRun} />}
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function RunPanel({ runId }: { runId: string }) {
  const view = usePoll<RunView>(`/api/workflows/${runId}`);
  const action = useAction();
  const v = view.data;
  if (!v) return <Card><p className="text-sm text-muted">Loading workflow…</p></Card>;
  const o = v.offer;

  const contact = (channel: "voice" | "portal", approvedBy: "system" | "property_manager") =>
    action.run(channel, async () => {
      await api(`/api/workflows/${runId}/contact`, { method: "POST", body: JSON.stringify({ channel, approved_by: approvedBy }) });
      await view.refresh();
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card title="Workflow" aside={<StateBadge state={v.run.state} />}>
          <Tracking state={v.run.state} category={o?.category} />
          {o && (
            <div className="mt-4 rounded-lg bg-paper p-3 text-sm">
              <p className="font-medium">{o.product} · {o.partner_name} · {eur(o.monthly_price_cents)}/mo</p>
              <p className="text-muted">
                Needed by {day(o.target_date)} · {o.business_days_available} business days left · partner needs {o.lead_time_business_days}
              </p>
              {o.on_time ? (
                <p className="text-emerald-800">Live on move-in day.</p>
              ) : (
                <p className="text-amber-800">
                  Earliest activation {day(o.start_date)}{o.bridge ? ` → bridge: ${o.bridge.product} by ${day(o.bridge.ready_by)}` : ""}.
                </p>
              )}
            </div>
          )}
          {v.run.state === "detected" && (
            <div className="mt-4 rounded-lg border border-dashed border-accent/40 p-3">
              <p className="mb-2 text-sm"><span className="font-medium text-accent">Suggested next step:</span> call {v.tenant?.name ?? "the tenant"} with this offer.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => contact("voice", "system")} busy={action.pending === "voice"}>Call tenant (voice agent)</Button>
                <Button variant="secondary" onClick={() => contact("portal", "property_manager")} busy={action.pending === "portal"}>Approve & send to portal</Button>
              </div>
            </div>
          )}
          {v.run.state !== "detected" && v.tenant && (
            <p className="mt-3 text-sm"><Link className="text-brand underline" href={`/portal/${v.tenant.id}`}>Open {v.tenant.name}&apos;s portal →</Link></p>
          )}
          <div className="mt-2"><ErrorText>{action.error}</ErrorText></div>
        </Card>

        <Card title="Timeline (audit log)">
          <ol className="space-y-1.5 text-sm">
            {v.audit.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="w-12 shrink-0 tabular-nums text-muted">{time(a.occurredAt)}</span>
                <span className="w-28 shrink-0 text-muted">{a.actor}</span>
                <span>
                  {a.type === "state_change" ? <>{a.fromState} → <span className="font-medium">{a.toState}</span></> : a.type.replace(/_/g, " ")}
                  {a.costCents > 0 && <span className="ml-2 text-xs text-muted">({eur(a.costCents)})</span>}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Cost per case">
          <dl className="space-y-2 text-sm">
            <Metric k="AI cost so far" v={eur(v.metrics.ai_cost_cents)} strong />
            <Metric k="Manual touches" v={String(v.metrics.manual_touches)} strong />
            <Metric k="Automated messages" v={String(v.metrics.automated_messages)} />
            <hr className="border-line" />
            <Metric k="Today (manual baseline)" v={`~${v.metrics.baseline_manual_minutes} min · ${eur(v.metrics.baseline_manual_cost_cents)}`} />
          </dl>
          <p className="mt-2 text-xs text-muted">Baseline assumes 12 contacts × 4 min at €35/h. Voice billed at ~€0.12/min.</p>
        </Card>
        {v.consent && (
          <Card title="Consent">
            <p className="text-sm">Given via <span className="font-medium">{v.consent.channel}</span> at {time(v.consent.givenAt)}</p>
            <p className="text-sm text-muted">Shared: {v.consent.dataShared.join(", ")}</p>
          </Card>
        )}
        {v.order && (
          <Card title="What the partner received">
            <pre className="overflow-x-auto rounded bg-paper p-2 text-xs">{JSON.stringify(v.order.sharedPayload, null, 2)}</pre>
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className={strong ? "font-semibold" : ""}>{v}</dd>
    </div>
  );
}

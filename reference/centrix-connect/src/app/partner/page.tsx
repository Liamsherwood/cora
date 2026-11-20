"use client";

import { api, day, time, useAction, usePoll } from "@/components/client";
import { Button, Card, ErrorText, StateBadge } from "@/components/ui";
import type { PartnerOrder } from "@/components/types";

/**
 * Stand-in for the partner's own system. Each button makes the partner backend send a
 * signed status webhook to centrix (HMAC-SHA256), exactly as a real integration would.
 */
export default function PartnerPage() {
  const orders = usePoll<PartnerOrder[]>("/api/partner/orders");
  const action = useAction();

  const send = (orderId: string, status: string, extra: Record<string, string> = {}) =>
    action.run(`${orderId}:${status}`, async () => {
      await api(`/api/partner-sim/orders/${orderId}/status`, { method: "POST", body: JSON.stringify({ status, ...extra }) });
      await orders.refresh();
    });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Partner dashboard</h1>
        <p className="text-sm text-muted">Orders arrive pre-filled from centrix, with consent attached. No forms, no calls.</p>
      </div>
      <ErrorText>{orders.error || action.error}</ErrorText>
      {orders.data?.length === 0 && <Card><p className="text-sm text-muted">No orders yet.</p></Card>}
      <div className="grid gap-4 md:grid-cols-2">
        {orders.data?.map((o) => {
          const busy = (s: string) => action.pending === `${o.id}:${s}`;
          const terminal = o.status === "active" || o.status === "rejected";
          return (
            <Card key={o.id} title={o.partner_name} aside={<StateBadge state={o.status === "sent" ? "ordered" : o.status === "accepted" || o.status === "scheduled" ? "confirmed" : o.status} />}>
              <p className="text-xs text-muted">Order {o.id} · received {time(o.created_at)} · requested start {day(o.start_date)}</p>
              <pre className="mt-2 overflow-x-auto rounded bg-paper p-2 text-xs">{JSON.stringify(o.received, null, 2)}</pre>
              {!terminal && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {o.status === "sent" && <Button onClick={() => send(o.id, "accepted")} busy={busy("accepted")}>Accept order</Button>}
                  {o.statuses.includes("scheduled") && (o.status === "accepted" || o.status === "sent") && (
                    <Button variant="secondary" onClick={() => send(o.id, "scheduled", { activation_date: o.start_date })} busy={busy("scheduled")}>Schedule activation</Button>
                  )}
                  <Button variant="secondary" onClick={() => send(o.id, "active", { activation_date: o.start_date })} busy={busy("active")}>Mark as live</Button>
                  <Button variant="danger" onClick={() => send(o.id, "rejected", { note: "Address not serviceable" })} busy={busy("rejected")}>Reject</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

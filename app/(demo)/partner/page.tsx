"use client"

import {
  api,
  day,
  time,
  useAction,
  usePoll,
} from "@/components/partner-connect/client"
import {
  ErrorText,
  Spinner,
  StateBadge,
} from "@/components/partner-connect/status"
import type { PartnerOrder } from "@/components/partner-connect/types"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/** Order status -> the workflow state it corresponds to, for a consistent badge. */
const BADGE: Record<string, string> = {
  sent: "ordered",
  accepted: "confirmed",
  scheduled: "confirmed",
  active: "active",
  rejected: "rejected",
}

/**
 * Stand-in for the partner's own system. Each button makes the partner backend send a
 * signed status webhook to centrix (HMAC-SHA256), exactly as a real integration would.
 */
export default function PartnerPage() {
  const orders = usePoll<PartnerOrder[]>("/api/partner/orders")
  const action = useAction()

  const send = (
    orderId: string,
    status: string,
    extra: Record<string, string> = {}
  ) =>
    action.run(`${orderId}:${status}`, async () => {
      await api(`/api/partner-sim/orders/${orderId}/status`, {
        method: "POST",
        body: JSON.stringify({ status, ...extra }),
      })
      await orders.refresh()
    })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Partner dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Orders arrive pre-filled from centrix, with consent attached. No
          forms, no calls.
        </p>
      </div>
      <ErrorText>{orders.error || action.error}</ErrorText>
      {orders.data?.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {orders.data?.map((o) => {
          const spin = (s: string) =>
            action.pending === `${o.id}:${s}` && <Spinner />
          const busy = action.pending !== null
          const terminal = o.status === "active" || o.status === "rejected"
          return (
            <Card key={o.id}>
              <CardHeader>
                <CardTitle>
                  {o.partner_name} · {o.product}
                </CardTitle>
                <CardDescription>
                  Received {time(o.created_at)} · requested start{" "}
                  {day(o.start_date)}
                </CardDescription>
                <CardAction>
                  <StateBadge state={BADGE[o.status] ?? o.status} />
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="overflow-x-auto bg-muted p-2 text-xs">
                  {JSON.stringify(o.received, null, 2)}
                </pre>
                {!terminal && (
                  <div className="flex flex-wrap gap-2">
                    {o.status === "sent" && (
                      <Button
                        onClick={() => send(o.id, "accepted")}
                        disabled={busy}
                      >
                        {spin("accepted")}
                        Accept order
                      </Button>
                    )}
                    {o.statuses.includes("scheduled") &&
                      (o.status === "accepted" || o.status === "sent") && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            send(o.id, "scheduled", {
                              activation_date: o.start_date,
                            })
                          }
                          disabled={busy}
                        >
                          {spin("scheduled")}
                          Schedule activation
                        </Button>
                      )}
                    <Button
                      variant="outline"
                      onClick={() =>
                        send(o.id, "active", { activation_date: o.start_date })
                      }
                      disabled={busy}
                    >
                      {spin("active")}
                      Mark as live
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        send(o.id, "rejected", {
                          note: "Address not serviceable",
                        })
                      }
                      disabled={busy}
                    >
                      {spin("rejected")}
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

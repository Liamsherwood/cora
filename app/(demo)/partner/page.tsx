import { connection } from "next/server"

import { partnerStatusAction } from "@/app/(demo)/actions"
import { ActionButton } from "@/components/partner-connect/action-button"
import { AutoRefresh } from "@/components/partner-connect/auto-refresh"
import { day, time } from "@/components/partner-connect/format"
import { StateBadge } from "@/components/partner-connect/status"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getDb } from "@/lib/db"
import { listPartnerFeed } from "@/lib/partner/feed"

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
export default async function PartnerPage() {
  await connection()
  const orders = await listPartnerFeed(getDb())

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div>
        <h1 className="text-lg font-semibold">Partner dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Orders arrive pre-filled from centrix, with consent attached. No
          forms, no calls.
        </p>
      </div>
      {orders.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {orders.map((o) => {
          const terminal = o.status === "active" || o.status === "rejected"
          const send = partnerStatusAction.bind(null, o.id)
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
                      <ActionButton
                        action={send.bind(null, { status: "accepted" })}
                      >
                        Accept order
                      </ActionButton>
                    )}
                    {o.statuses.includes("scheduled") &&
                      (o.status === "accepted" || o.status === "sent") && (
                        <ActionButton
                          variant="outline"
                          action={send.bind(null, {
                            status: "scheduled",
                            activation_date: o.start_date,
                          })}
                        >
                          Schedule activation
                        </ActionButton>
                      )}
                    <ActionButton
                      variant="outline"
                      action={send.bind(null, {
                        status: "active",
                        activation_date: o.start_date,
                      })}
                    >
                      Mark as live
                    </ActionButton>
                    <ActionButton
                      variant="destructive"
                      action={send.bind(null, {
                        status: "rejected",
                        note: "Address not serviceable",
                      })}
                    >
                      Reject
                    </ActionButton>
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

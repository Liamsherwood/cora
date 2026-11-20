import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import {
  contactTenantAction,
  fireMoveInAction,
  resetDemoAction,
} from "@/app/(demo)/actions"
import { ActionButton } from "@/components/partner-connect/action-button"
import { AutoRefresh } from "@/components/partner-connect/auto-refresh"
import { day, eur, eurDecimal, time } from "@/components/partner-connect/format"
import { StateBadge, Tracking } from "@/components/partner-connect/status"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { getUnitSnapshot, listUnits } from "@/lib/centrix/repository"
import { getDb } from "@/lib/db"
import { DEMO_UNIT_ID } from "@/lib/demo"
import { AppError } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { cn } from "@/lib/utils"
import { getRunView, listRuns } from "@/lib/workflow/engine"

const CONTRACT_BADGE: Record<string, string> = {
  signed: "confirmed",
  active: "active",
  cancelled: "rejected",
}

/** The property manager's view: units, the moment detected on a unit, and its workflows. */
export default async function CentrixPage({
  searchParams,
}: PageProps<"/centrix">) {
  await connection()
  const sp = await searchParams
  const unitId =
    typeof sp.unit === "string" && isUuid(sp.unit) ? sp.unit : DEMO_UNIT_ID
  const db = getDb()

  const [units, snapshot, runs] = await Promise.all([
    listUnits(db),
    getUnitSnapshot(db, unitId).catch((e) => {
      if (e instanceof AppError && e.status === 404) notFound()
      throw e
    }),
    listRuns(db, { unitId }),
  ])
  const selectedRun =
    runs.find((r) => r.id === sp.run)?.id ?? runs[0]?.id ?? null
  const view = selectedRun ? await getRunView(db, selectedRun) : null
  const href = (q: { unit?: string; run?: string }) =>
    `/centrix?${new URLSearchParams({ unit: unitId, ...q })}`

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <AutoRefresh />
      <aside className="space-y-2">
        <h1 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Units
        </h1>
        <nav className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {groupByProperty(units).map((g) => (
            <section key={g.propertyId} className="space-y-1">
              <h2 className="sticky top-0 bg-muted/90 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                {g.street}
                {g.city && ` · ${g.city}`}
              </h2>
              {g.units.map((u) => (
                <Link
                  key={u.id}
                  href={href({ unit: u.id })}
                  className={cn(
                    "block w-full border px-3 py-2 text-left text-sm font-medium",
                    u.id === unitId
                      ? "border-primary bg-background"
                      : "bg-background/60 hover:bg-background"
                  )}
                >
                  {u.identifier}
                </Link>
              ))}
            </section>
          ))}
        </nav>
        <div className="flex flex-wrap pt-4">
          <ActionButton variant="ghost" action={resetDemoAction}>
            Reset demo data
          </ActionButton>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              Unit {snapshot.unit.identifier} · {snapshot.property.address}
            </CardTitle>
            <CardAction className="flex flex-wrap justify-end">
              <ActionButton
                action={fireMoveInAction.bind(null, unitId)}
                disabled={!snapshot.tenant}
              >
                Fire event: tenant.move_in
              </ActionButton>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <Info k="Tenant" v={snapshot.tenant?.name ?? "–"} />
              <Info k="Move-in" v={day(snapshot.tenant?.move_in)} />
              <Info k="Owner" v={snapshot.owner?.name ?? "–"} />
              <Info k="WEG" v={snapshot.property.is_weg ? "yes" : "no"} />
              <Info
                k="Size"
                v={`${snapshot.unit.size_sqm ?? "–"} m² · ${snapshot.unit.rooms ?? "–"} rooms`}
              />
              <Info k="Heating" v={snapshot.property.heating ?? "–"} />
              <Info
                k="Energy class"
                v={snapshot.property.energy_certificate.class ?? "–"}
              />
              <Info k="Meter" v={snapshot.unit.meters[0]?.number ?? "–"} />
            </dl>
            <Separator />
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Service contracts on this unit
              </h3>
              {snapshot.service_contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None yet. Fire the move-in event to start.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {snapshot.service_contracts.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <StateBadge
                        state={CONTRACT_BADGE[c.status] ?? c.status}
                        label={c.status}
                      />
                      <span className="font-medium">{c.product}</span>
                      <span className="text-muted-foreground">
                        · {c.partner_name} · {eurDecimal(c.monthly_price_eur)}
                        /mo · from {day(c.start_date)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        consent via {c.consent.channel}:{" "}
                        {c.consent.data_shared.join(", ")}
                        {c.consent.revoked_at ? " (withdrawn)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {runs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {runs.map((r) => (
              <Link
                key={r.id}
                href={href({ run: r.id })}
                className={cn(
                  "flex items-center gap-2 border bg-background px-3 py-1.5 text-sm",
                  r.id === selectedRun
                    ? "border-primary"
                    : "opacity-80 hover:opacity-100"
                )}
              >
                {r.partnerName ?? r.partnerSlug} <StateBadge state={r.state} />
              </Link>
            ))}
          </div>
        )}
        {view && <RunPanel view={view} />}
      </div>
    </div>
  )
}

type UnitRow = Awaited<ReturnType<typeof listUnits>>[number]

/** Units grouped by property, the demo unit's property first, then by address. */
function groupByProperty(units: UnitRow[]) {
  const groups = new Map<
    string,
    {
      propertyId: string
      street: string
      city: string | null
      units: UnitRow[]
    }
  >()
  for (const u of units) {
    const g = groups.get(u.property_id) ?? {
      propertyId: u.property_id,
      street: u.street,
      city: u.city,
      units: [],
    }
    g.units.push(u)
    groups.set(u.property_id, g)
  }
  const isDemo = (g: { units: UnitRow[] }) =>
    g.units.some((u) => u.id === DEMO_UNIT_ID)
  return [...groups.values()].sort(
    (a, b) => Number(isDemo(b)) - Number(isDemo(a))
  )
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

function RunPanel({
  view: v,
}: {
  view: Awaited<ReturnType<typeof getRunView>>
}) {
  const o = v.offer
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Workflow · {v.partner?.name}</CardTitle>
            <CardAction>
              <StateBadge state={v.run.state} />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tracking state={v.run.state} category={o?.category} />
            {o && (
              <div className="bg-muted p-3 text-sm">
                <p className="font-medium">
                  {o.product} · {o.partner_name} · {eur(o.monthly_price_cents)}
                  /mo
                </p>
                <p className="text-muted-foreground">
                  Needed by {day(o.target_date)} · {o.business_days_available}{" "}
                  business days left · partner needs {o.lead_time_business_days}
                </p>
                {o.on_time ? (
                  <p className="text-emerald-700 dark:text-emerald-400">
                    Live on move-in day.
                  </p>
                ) : (
                  <p className="text-amber-700 dark:text-amber-400">
                    Earliest activation {day(o.start_date)}
                    {o.bridge
                      ? ` → bridge: ${o.bridge.product} by ${day(o.bridge.ready_by)}`
                      : ""}
                    .
                  </p>
                )}
              </div>
            )}
            {v.run.state === "detected" && (
              <div className="border border-dashed p-3">
                <p className="mb-2 text-sm">
                  <span className="font-medium">Suggested next step:</span> call{" "}
                  {v.tenant?.name ?? "the tenant"} with this offer.
                </p>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    action={contactTenantAction.bind(null, v.run.id, "voice")}
                  >
                    Call tenant (voice agent)
                  </ActionButton>
                  <ActionButton
                    variant="outline"
                    action={contactTenantAction.bind(null, v.run.id, "portal")}
                  >
                    Approve &amp; send to portal
                  </ActionButton>
                </div>
              </div>
            )}
            {v.run.state !== "detected" && v.tenant && (
              <p className="text-sm">
                <Link
                  className="underline underline-offset-4"
                  href={`/portal/${v.tenant.id}`}
                >
                  Open {v.tenant.name}&apos;s portal →
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timeline (audit log)</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1.5 text-sm">
              {v.audit.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="w-12 shrink-0 text-muted-foreground tabular-nums">
                    {time(a.occurredAt)}
                  </span>
                  <span className="w-28 shrink-0 text-muted-foreground">
                    {a.actor}
                  </span>
                  <span>
                    {a.type === "state_change" ? (
                      <>
                        {a.fromState} →{" "}
                        <span className="font-medium">{a.toState}</span>
                      </>
                    ) : (
                      a.type.replace(/_/g, " ")
                    )}
                    {a.costCents > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({eur(a.costCents)})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Cost per case</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Metric
                k="AI cost so far"
                v={eur(v.metrics.ai_cost_cents)}
                strong
              />
              <Metric
                k="Manual touches"
                v={String(v.metrics.manual_touches)}
                strong
              />
              <Metric
                k="Automated messages"
                v={String(v.metrics.automated_messages)}
              />
              <Separator />
              <Metric
                k="Today (manual baseline)"
                v={`~${v.metrics.baseline_manual_minutes} min · ${eur(v.metrics.baseline_manual_cost_cents)}`}
              />
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Baseline assumes 12 contacts × 4 min at €35/h. Voice billed at
              ~€0.12/min.
            </p>
          </CardContent>
        </Card>
        {v.consent && (
          <Card>
            <CardHeader>
              <CardTitle>Consent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                Given via{" "}
                <span className="font-medium">{v.consent.channel}</span> at{" "}
                {time(v.consent.givenAt)}
                {v.consent.revokedAt
                  ? ` · withdrawn at ${time(v.consent.revokedAt)}`
                  : ""}
              </p>
              <p className="text-muted-foreground">
                Shared: {v.consent.dataShared.join(", ")}
              </p>
            </CardContent>
          </Card>
        )}
        {v.order && (
          <Card>
            <CardHeader>
              <CardTitle>What the partner received</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto bg-muted p-2 text-xs">
                {JSON.stringify(v.order.sharedPayload, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Metric({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={strong ? "font-semibold" : ""}>{v}</dd>
    </div>
  )
}

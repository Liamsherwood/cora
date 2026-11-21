import Link from "next/link"
import { notFound } from "next/navigation"

import {
  contactTenantAction,
  fireMoveInAction,
} from "@/app/[locale]/(demo)/actions"
import { ActionButton } from "@/components/partner-connect/action-button"
import { StateBadge, Tracking } from "@/components/partner-connect/status"
import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { findUnitsByTenant } from "@/lib/centrix/directory"
import { getUnitSnapshot, listUnits } from "@/lib/centrix/repository"
import type { DB } from "@/lib/db"
import { DEMO_UNIT_ID } from "@/lib/demo"
import { AppError } from "@/lib/errors"
import { formatMessage as fm } from "@/lib/i18n/format-message"
import { isUuid } from "@/lib/ids"
import { cn } from "@/lib/utils"
import { getRunView, listRuns } from "@/lib/workflow/engine"

import type { DirectoryFormat } from "./format"
import {
  directoryHref,
  Empty,
  Fact,
  GroupLabel,
  Panel,
  SearchForm,
  type DirectoryMessages,
} from "./ui"

const CONTRACT_BADGE: Record<string, string> = {
  signed: "confirmed",
  active: "active",
  cancelled: "rejected",
}

type UnitRow = Awaited<ReturnType<typeof listUnits>>[number]

/**
 * Units: every unit grouped by property, and for the selected one its master data, the
 * service contracts written back to it and the partner workflows centrix started.
 */
export async function UnitsTab({
  db,
  locale,
  q,
  unitParam,
  runParam,
  messages,
  format,
}: {
  db: DB
  locale: string
  q: string
  unitParam: string | undefined
  runParam: string | undefined
  messages: DirectoryMessages
  format: DirectoryFormat
}) {
  const [units, tenantMatches] = await Promise.all([
    listUnits(db),
    findUnitsByTenant(db, q),
  ])
  const term = q.trim().toLocaleLowerCase()
  const matching = term
    ? units.filter(
        (u) =>
          tenantMatches.includes(u.id) ||
          `${u.street} ${u.city ?? ""} ${u.identifier}`
            .toLocaleLowerCase()
            .includes(term)
      )
    : units
  const unitId = isUuid(unitParam)
    ? unitParam
    : term
      ? matching[0]?.id
      : DEMO_UNIT_ID
  const href = (params: { unit?: string; run?: string }) =>
    directoryHref(locale, { q, unit: unitId, ...params })

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      <Panel flush>
        <div className="border-b border-border p-3">
          <SearchForm
            locale={locale}
            tab="units"
            q={q}
            placeholder={messages.searchUnits}
            messages={messages}
          />
        </div>
        {matching.length === 0 ? (
          <div className="px-5 py-4">
            <Empty>{messages.noResults}</Empty>
          </div>
        ) : (
          <nav
            aria-label={messages.tabs.units}
            className="max-h-[38svh] overflow-y-auto pb-2 lg:max-h-[68svh]"
          >
            {groupByProperty(matching).map((g) => (
              <section key={g.propertyId}>
                <h3 className="sticky top-0 z-10 border-b border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  {g.street}
                  {g.city && ` · ${g.city}`}
                </h3>
                <ul>
                  {g.units.map((u) => (
                    <li key={u.id}>
                      <Link
                        href={directoryHref(locale, { q, unit: u.id })}
                        aria-current={u.id === unitId ? "page" : undefined}
                        prefetch={false}
                        className="block px-4 py-2 text-sm hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-accent-foreground"
                      >
                        {u.identifier}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        )}
      </Panel>

      {unitId ? (
        <UnitDetail
          db={db}
          locale={locale}
          unitId={unitId}
          runParam={runParam}
          href={href}
          messages={messages}
          format={format}
        />
      ) : (
        <Panel>
          <Empty>{messages.noResults}</Empty>
        </Panel>
      )}
    </div>
  )
}

async function UnitDetail({
  db,
  locale,
  unitId,
  runParam,
  href,
  messages,
  format,
}: {
  db: DB
  locale: string
  unitId: string
  runParam: string | undefined
  href: (params: { run?: string }) => string
  messages: DirectoryMessages
  format: DirectoryFormat
}) {
  const m = messages.unit
  const [snapshot, runs] = await Promise.all([
    getUnitSnapshot(db, unitId).catch((e) => {
      if (e instanceof AppError && e.status === 404) notFound()
      throw e
    }),
    listRuns(db, { unitId }),
  ])
  const selectedRun =
    runs.find((r) => r.id === runParam)?.id ?? runs[0]?.id ?? null
  const view = selectedRun ? await getRunView(db, selectedRun) : null
  const sizeValue =
    snapshot.unit.size_sqm == null && snapshot.unit.rooms == null
      ? "–"
      : fm(m.sizeValue, {
          size: String(snapshot.unit.size_sqm ?? "–"),
          rooms: String(snapshot.unit.rooms ?? "–"),
        })

  return (
    <div className="min-w-0 space-y-5">
      <Panel
        title={fm(m.title, {
          unit: snapshot.unit.identifier,
          address: snapshot.property.address,
        })}
        action={
          <ActionButton
            action={fireMoveInAction.bind(null, unitId)}
            disabled={!snapshot.tenant}
          >
            {m.fireMoveIn}
          </ActionButton>
        }
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact
            label={m.tenant}
            value={
              snapshot.tenant ? (
                <Link
                  className="underline-offset-4 hover:underline"
                  href={directoryHref(locale, {
                    tab: "people",
                    person: snapshot.tenant.contact_id,
                  })}
                >
                  {snapshot.tenant.name}
                </Link>
              ) : (
                "–"
              )
            }
          />
          <Fact label={m.moveIn} value={format.day(snapshot.tenant?.move_in)} />
          <Fact
            label={m.owner}
            value={
              snapshot.owner ? (
                <Link
                  className="underline-offset-4 hover:underline"
                  href={directoryHref(locale, {
                    tab: "people",
                    person: snapshot.owner.contact_id,
                  })}
                >
                  {snapshot.owner.name}
                </Link>
              ) : (
                "–"
              )
            }
          />
          <Fact
            label={m.weg}
            value={snapshot.property.is_weg ? messages.yes : messages.no}
          />
          <Fact label={m.size} value={sizeValue} />
          <Fact label={m.heating} value={snapshot.property.heating ?? "–"} />
          <Fact
            label={m.energyClass}
            value={snapshot.property.energy_certificate.class ?? "–"}
          />
          <Fact
            label={m.meter}
            value={snapshot.unit.meters[0]?.number ?? "–"}
          />
        </dl>
        <Separator className="my-4" />
        <GroupLabel>{m.contracts}</GroupLabel>
        {snapshot.service_contracts.length === 0 ? (
          <Empty>{m.noContracts}</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {snapshot.service_contracts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <StateBadge
                  state={CONTRACT_BADGE[c.status] ?? c.status}
                  label={c.status}
                />
                <span className="font-medium">{c.product}</span>
                <span className="text-muted-foreground">
                  {fm(m.contractTerms, {
                    partner: c.partner_name,
                    price: format.eur(c.monthly_price_eur),
                    date: format.day(c.start_date),
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fm(m.consentVia, {
                    channel: c.consent.channel,
                    fields: c.consent.data_shared.join(", "),
                  })}
                  {c.consent.revoked_at ? ` (${m.withdrawn})` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {runs.length > 0 && (
        <nav aria-label={m.workflows} className="flex flex-wrap gap-2">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={href({ run: r.id })}
              aria-current={r.id === selectedRun ? "page" : undefined}
              className={cn(
                buttonVariants({
                  variant: r.id === selectedRun ? "secondary" : "outline",
                }),
                "rounded-(--radius-chip)"
              )}
            >
              {r.partnerName ?? r.partnerSlug} <StateBadge state={r.state} />
            </Link>
          ))}
        </nav>
      )}
      {view && (
        <RunPanel
          view={view}
          locale={locale}
          messages={messages}
          format={format}
        />
      )}
    </div>
  )
}

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

function RunPanel({
  view: v,
  locale,
  messages,
  format,
}: {
  view: Awaited<ReturnType<typeof getRunView>>
  locale: string
  messages: DirectoryMessages
  format: DirectoryFormat
}) {
  const m = messages.run
  const o = v.offer
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <Panel
          title={fm(m.title, { partner: v.partner?.name ?? "–" })}
          action={<StateBadge state={v.run.state} />}
        >
          <div className="space-y-4">
            <Tracking state={v.run.state} category={o?.category} />
            {o && (
              <div className="rounded-(--radius-card) bg-muted p-3 text-sm">
                <p className="font-medium">
                  {fm(m.offer, {
                    product: o.product,
                    partner: o.partner_name,
                    price: format.cents(o.monthly_price_cents),
                  })}
                </p>
                <p className="text-muted-foreground">
                  {fm(m.neededBy, {
                    date: format.day(o.target_date),
                    available: String(o.business_days_available),
                    lead: String(o.lead_time_business_days),
                  })}
                </p>
                {o.on_time ? (
                  <p className="text-success">{m.liveOnMoveIn}</p>
                ) : (
                  <p className="text-amber-700 dark:text-amber-400">
                    {fm(m.earliestActivation, {
                      date: format.day(o.start_date),
                    })}
                    {o.bridge &&
                      ` ${fm(m.bridge, {
                        product: o.bridge.product,
                        date: format.day(o.bridge.ready_by),
                      })}`}
                  </p>
                )}
              </div>
            )}
            {v.run.state === "detected" && (
              <div className="rounded-(--radius-card) border border-dashed border-border p-3">
                <p className="mb-2 text-sm">
                  <span className="font-medium">{m.suggestedStep}</span>{" "}
                  {fm(m.callWithOffer, {
                    name: v.tenant?.name ?? m.theTenant,
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    action={contactTenantAction.bind(null, v.run.id, "voice")}
                  >
                    {m.callTenant}
                  </ActionButton>
                  <ActionButton
                    variant="outline"
                    action={contactTenantAction.bind(null, v.run.id, "portal")}
                  >
                    {m.sendToPortal}
                  </ActionButton>
                </div>
              </div>
            )}
            {v.run.state !== "detected" && v.tenant && (
              <p className="text-sm">
                <Link
                  className="underline underline-offset-4"
                  href={`/${locale}/portal/${v.tenant.id}`}
                >
                  {fm(m.openPortal, { name: v.tenant.name })} →
                </Link>
              </p>
            )}
          </div>
        </Panel>

        <Panel title={m.timeline}>
          <ol className="space-y-1.5 text-sm">
            {v.audit.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                  {format.time(a.occurredAt)}
                </span>
                <span className="w-28 shrink-0 truncate text-muted-foreground">
                  {a.actor}
                </span>
                <span className="min-w-0">
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
                      ({format.cents(a.costCents)})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title={m.costPerCase}>
          <dl className="space-y-2 text-sm">
            <Metric
              k={m.aiCost}
              v={format.cents(v.metrics.ai_cost_cents)}
              strong
            />
            <Metric
              k={m.manualTouches}
              v={format.number(v.metrics.manual_touches)}
              strong
            />
            <Metric
              k={m.automatedMessages}
              v={format.number(v.metrics.automated_messages)}
            />
            <Separator />
            <Metric
              k={m.baseline}
              v={fm(m.baselineValue, {
                minutes: format.number(v.metrics.baseline_manual_minutes),
                cost: format.cents(v.metrics.baseline_manual_cost_cents),
              })}
            />
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{m.baselineNote}</p>
        </Panel>
        {v.consent && (
          <Panel title={m.consent}>
            <div className="space-y-1 text-sm">
              <p>
                {fm(m.consentGiven, {
                  channel: v.consent.channel,
                  time: format.time(v.consent.givenAt),
                })}
              </p>
              {v.consent.revokedAt && (
                <p className="text-destructive">
                  {fm(m.consentWithdrawn, {
                    time: format.time(v.consent.revokedAt),
                  })}
                </p>
              )}
              <p className="text-muted-foreground">
                {fm(m.shared, { fields: v.consent.dataShared.join(", ") })}
              </p>
            </div>
          </Panel>
        )}
        {v.order && (
          <Panel title={m.partnerReceived}>
            <pre className="overflow-x-auto rounded-(--radius-card) bg-muted p-2 text-xs">
              {JSON.stringify(v.order.sharedPayload, null, 2)}
            </pre>
          </Panel>
        )}
      </div>
    </div>
  )
}

function Metric({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn("text-right", strong && "font-semibold")}>{v}</dd>
    </div>
  )
}

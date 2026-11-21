import Link from "next/link"
import { notFound } from "next/navigation"

import {
  contactTenantAction,
  fireMoveInAction,
} from "@/app/[locale]/(demo)/actions"
import type { DocumentMessages } from "@/components/documents/format"
import { DocumentList } from "@/components/documents/list"
import { ActionButton } from "@/components/partner-connect/action-button"
import { StateBadge } from "@/components/partner-connect/status"
import { CoraAvatar } from "@/components/tickets/cora-avatar"
import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { findUnitsByTenant, listDirectoryUnits } from "@/lib/centrix/directory"
import { listUnitDocuments } from "@/lib/centrix/documents"
import { getUnitSnapshot } from "@/lib/centrix/repository"
import type { DB } from "@/lib/db"
import { DEMO_UNIT_ID } from "@/lib/demo"
import { AppError } from "@/lib/errors"
import { formatMessage as fm } from "@/lib/i18n/format-message"
import { isUuid } from "@/lib/ids"
import { cn } from "@/lib/utils"
import { getRunView, listRuns } from "@/lib/workflow/engine"
import { TRACKING_STEPS } from "@/lib/workflow/states"

import type { DirectoryFormat } from "./format"
import {
  directoryHref,
  Empty,
  Fact,
  GroupLabel,
  Panel,
  SearchForm,
  serviceName,
  type DirectoryMessages,
} from "./ui"

const CONTRACT_BADGE: Record<string, string> = {
  signed: "confirmed",
  active: "active",
  cancelled: "rejected",
}

type UnitRow = Awaited<ReturnType<typeof listDirectoryUnits>>[number]

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
  documents,
  format,
}: {
  db: DB
  locale: string
  q: string
  unitParam: string | undefined
  runParam: string | undefined
  messages: DirectoryMessages
  documents: DocumentMessages
  format: DirectoryFormat
}) {
  const [units, tenantMatches] = await Promise.all([
    listDirectoryUnits(db),
    findUnitsByTenant(db, q),
  ])
  const term = q.trim().toLocaleLowerCase()
  const matching = term
    ? units.filter(
        (u) =>
          tenantMatches.includes(u.id) ||
          `${u.street} ${u.city ?? ""} ${u.identifier} ${u.tenant ?? ""}`
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
  const m = messages.unit

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
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
                        className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {u.identifier}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {u.tenant ?? m.vacant}
                            {u.size_sqm != null && ` · ${u.size_sqm} m²`}
                          </span>
                        </span>
                        {u.open_workflows > 0 && (
                          <StateBadge
                            state="detected"
                            label={fm(m.openWorkflows, {
                              count: format.number(u.open_workflows),
                            })}
                          />
                        )}
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
          documents={documents}
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
  documents,
  format,
}: {
  db: DB
  locale: string
  unitId: string
  runParam: string | undefined
  href: (params: { run?: string }) => string
  messages: DirectoryMessages
  documents: DocumentMessages
  format: DirectoryFormat
}) {
  const m = messages.unit
  const [snapshot, runs, files] = await Promise.all([
    getUnitSnapshot(db, unitId).catch((e) => {
      if (e instanceof AppError && e.status === 404) notFound()
      throw e
    }),
    listRuns(db, { unitId }),
    listUnitDocuments(db, unitId),
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
        <Separator className="my-4" />
        <GroupLabel>{documents.heading}</GroupLabel>
        {files.length === 0 ? (
          <Empty>{messages.none}</Empty>
        ) : (
          <DocumentList
            links={files}
            locale={locale}
            messages={documents}
            format={format}
          />
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
              {serviceName(
                messages.run,
                (r.offer as { category?: string } | null)?.category,
                r.partnerName ?? r.partnerSlug
              )}{" "}
              <StateBadge state={r.state} />
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

type RunView = Awaited<ReturnType<typeof getRunView>>

type RunMessages = DirectoryMessages["run"]

const details = (a: RunView["audit"][number]) =>
  (a.details ?? {}) as Record<string, unknown>

function channelLabel(m: RunMessages, channel: unknown) {
  return typeof channel === "string" && channel in m.channels
    ? m.channels[channel as keyof RunMessages["channels"]]
    : String(channel ?? "–")
}

function RunPanel({
  view: v,
  locale,
  messages,
  format,
}: {
  view: RunView
  locale: string
  messages: DirectoryMessages
  format: DirectoryFormat
}) {
  const m = messages.run
  const o = v.offer
  const name = v.tenant?.name ?? m.theTenant
  const aside = Boolean(v.consent || v.order)
  return (
    <div
      className={cn(
        "grid gap-5",
        aside && "xl:grid-cols-[minmax(0,1fr)_320px]"
      )}
    >
      <div className="min-w-0 space-y-5">
        <Panel
          title={serviceName(m, o?.category, v.partner?.name)}
          action={<StateBadge state={v.run.state} />}
        >
          <div className="space-y-5">
            <Stepper view={v} m={m} format={format} />
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
            <NextStep
              view={v}
              name={name}
              locale={locale}
              m={m}
              format={format}
            />
          </div>
        </Panel>

        <Panel title={m.conversation}>
          {v.messages.length === 0 ? (
            <Empty>{m.noMessages}</Empty>
          ) : (
            <ol className="space-y-3">
              {v.messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  sender={
                    msg.role === "agent"
                      ? m.cora
                      : msg.role === "tenant"
                        ? name
                        : msg.role === "partner"
                          ? (v.partner?.name ?? m.actors.partner)
                          : m.actors.system
                  }
                  time={format.time(msg.sentAt)}
                />
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={m.timeline}>
          <ol className="space-y-2 text-sm">
            {v.audit.map((a) => {
              const d = details(a)
              const actor =
                a.actor in m.actors
                  ? m.actors[a.actor as keyof RunMessages["actors"]]
                  : a.actor
              return (
                <li key={a.id} className="flex gap-3">
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                    {format.time(a.occurredAt)}
                  </span>
                  <span className="w-28 shrink-0 truncate text-muted-foreground">
                    {actor}
                  </span>
                  <span className="min-w-0">
                    <AuditLabel type={a.type} a={a} d={d} m={m} />
                    {typeof d.channel === "string" && (
                      <span className="text-muted-foreground">
                        {" "}
                        {fm(m.via, { channel: channelLabel(m, d.channel) })}
                      </span>
                    )}
                    {a.costCents > 0 && (
                      <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                        ({format.cents(a.costCents)})
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        </Panel>
      </div>

      <div className={cn("space-y-5", !aside && "hidden")}>
        {v.consent && (
          <Panel title={m.consent}>
            <div className="space-y-1 text-sm">
              <p>
                {fm(m.consentGiven, {
                  channel: channelLabel(m, v.consent.channel),
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

/** The workflow's steps with when each one was reached. */
function Stepper({
  view: v,
  m,
  format,
}: {
  view: RunView
  m: RunMessages
  format: DirectoryFormat
}) {
  const state = v.run.state
  const order = TRACKING_STEPS.map((s) => s.state)
  const reached = state === "closed" ? order.length - 1 : order.indexOf(state)
  const failed =
    state === "declined" ||
    state === "rejected" ||
    state === "no_eligible_offer"
  const reachedAt = new Map<string, Date>()
  reachedAt.set("detected", v.run.createdAt)
  for (const a of v.audit)
    if (a.type === "state_change" && a.toState && !reachedAt.has(a.toState))
      reachedAt.set(a.toState, a.occurredAt)

  return (
    <ol className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-6">
      {TRACKING_STEPS.map((s, i) => {
        const done = !failed && i <= reached
        const current = done && i === reached && !v.run.terminal
        return (
          <li key={s.state} className="relative min-w-0">
            <div className="flex items-center">
              <span
                className={cn(
                  "relative z-10 flex size-3 shrink-0 rounded-full",
                  done ? "bg-primary" : "bg-border",
                  current && "ring-4 ring-primary/20"
                )}
                aria-hidden
              />
              {i < TRACKING_STEPS.length - 1 && (
                <span
                  className={cn(
                    "ml-1 h-px flex-1",
                    done && i < reached ? "bg-primary" : "bg-border"
                  )}
                  aria-hidden
                />
              )}
            </div>
            <p
              className={cn(
                "mt-2 text-xs leading-snug text-pretty",
                done ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {m.steps[s.state as keyof RunMessages["steps"]]}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {done ? format.time(reachedAt.get(s.state)) : " "}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

/** What happens next, for every state: the property manager never has to guess. */
function NextStep({
  view: v,
  name,
  locale,
  m,
  format,
}: {
  view: RunView
  name: string
  locale: string
  m: RunMessages
  format: DirectoryFormat
}) {
  const state = v.run.state
  const copy = m.next[state as keyof RunMessages["next"]] ?? m.next.closed
  const values = { name, partner: v.partner?.name ?? "–" }
  const sent = v.audit.find(
    (a) => a.type === "state_change" && a.toState === "offer_sent"
  )
  const sentChannel = sent ? details(sent).channel : undefined
  const whatsappSent = v.audit.some((a) => a.type === "whatsapp.sent")
  const canWhatsApp = Boolean(v.tenant?.whatsappOptIn)
  const failed =
    state === "declined" ||
    state === "rejected" ||
    state === "no_eligible_offer"

  return (
    <div
      className={cn(
        "rounded-(--radius-card) border p-4",
        failed
          ? "border-destructive/30 bg-destructive/5"
          : state === "active" || state === "closed"
            ? "border-success/30 bg-success-surface"
            : "border-dashed border-border"
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{m.nextStep}</p>
      <p className="mt-1 font-medium">{fm(copy.title, values)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {state === "offer_sent" && sent
          ? `${fm(m.sentVia, {
              channel: channelLabel(m, sentChannel),
              time: format.time(sent.occurredAt),
            })} `
          : ""}
        {fm(copy.body, values)}
      </p>

      {state === "detected" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ActionButton
            action={contactTenantAction.bind(null, v.run.id, "voice", locale)}
          >
            {m.callTenant}
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={!canWhatsApp}
            title={canWhatsApp ? undefined : m.noWhatsApp}
            action={contactTenantAction.bind(
              null,
              v.run.id,
              "whatsapp",
              locale
            )}
          >
            {m.sendWhatsApp}
          </ActionButton>
          <ActionButton
            variant="ghost"
            action={contactTenantAction.bind(null, v.run.id, "portal", locale)}
          >
            {m.sendToPortal}
          </ActionButton>
          {!canWhatsApp && (
            <span className="text-xs text-muted-foreground">
              {m.noWhatsApp}
            </span>
          )}
        </div>
      )}

      {state !== "detected" && state !== "no_eligible_offer" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {state === "offer_sent" && canWhatsApp && !whatsappSent && (
            <ActionButton
              variant="outline"
              action={contactTenantAction.bind(
                null,
                v.run.id,
                "whatsapp",
                locale
              )}
            >
              {m.remindWhatsApp}
            </ActionButton>
          )}
          {v.tenant && (
            <Link
              className={buttonVariants({ variant: "ghost" })}
              href={`/${locale}/portal/${v.tenant.id}`}
            >
              {fm(m.openPortal, { name })} →
            </Link>
          )}
          {(state === "ordered" ||
            state === "confirmed" ||
            state === "rejected") && (
            <Link
              className={buttonVariants({ variant: "ghost" })}
              href={`/${locale}/partner`}
            >
              {m.openPartner} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function ChatMessage({
  role,
  content,
  sender,
  time,
}: {
  role: string
  content: string
  sender: string
  time: string
}) {
  if (role === "system" || role === "partner")
    return (
      <li className="rounded-(--radius-card) border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{sender}</span>{" "}
        <span className="tabular-nums">{time}</span>
        <p className="mt-0.5">{content}</p>
      </li>
    )
  const mine = role === "tenant"
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className="max-w-[85%]">
        <p
          className={cn(
            "mb-1 flex items-center gap-1.5 text-xs text-muted-foreground",
            mine && "justify-end"
          )}
        >
          {!mine && <CoraAvatar size={16} />}
          <span className="font-medium">{sender}</span>
          <span className="tabular-nums">{time}</span>
        </p>
        <p
          className={cn(
            "rounded-(--radius-card) px-3 py-2 text-sm",
            mine ? "bg-primary text-primary-foreground" : "bg-muted"
          )}
        >
          {content}
        </p>
      </div>
    </li>
  )
}

function AuditLabel({
  type,
  a,
  d,
  m,
}: {
  type: string
  a: RunView["audit"][number]
  d: Record<string, unknown>
  m: RunMessages
}) {
  if (type === "state_change")
    return (
      <>
        {a.fromState
          ? (m.steps[a.fromState as keyof RunMessages["steps"]] ?? a.fromState)
          : "–"}{" "}
        →{" "}
        <span className="font-medium">
          {m.steps[a.toState as keyof RunMessages["steps"]] ??
            a.toState?.replace(/_/g, " ")}
        </span>
      </>
    )
  const key =
    type === "whatsapp.sent"
      ? d.reminder
        ? "whatsapp_reminder"
        : "whatsapp_sent"
      : type
  return (
    <span className={cn(type === "error" && "text-destructive")}>
      {m.events[key as keyof RunMessages["events"]] ?? type.replace(/_/g, " ")}
      {type === "error" && typeof d.reason === "string" && `: ${d.reason}`}
    </span>
  )
}

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  getPerson,
  listPeople,
  DIRECTORY_PAGE_SIZE,
} from "@/lib/centrix/directory"
import type { DB } from "@/lib/db"
import { formatMessage as fm } from "@/lib/i18n/format-message"
import { isUuid } from "@/lib/ids"

import type { DirectoryFormat } from "./format"
import {
  directoryHref,
  Empty,
  Fact,
  GroupLabel,
  Pager,
  Panel,
  SearchForm,
  type DirectoryMessages,
} from "./ui"

/** People: every party centrix knows (tenants, owners, managers), and what links to them. */
export async function PeopleTab({
  db,
  locale,
  q,
  page,
  personParam,
  messages,
  format,
}: {
  db: DB
  locale: string
  q: string
  page: number
  personParam: string | undefined
  messages: DirectoryMessages
  format: DirectoryFormat
}) {
  const m = messages.person
  const rows = await listPeople(db, { q, page })
  const people = rows.slice(0, DIRECTORY_PAGE_SIZE)
  const personId = isUuid(personParam) ? personParam : people[0]?.id
  const person = personId ? await getPerson(db, personId) : null
  const href = (params: { person?: string; page?: number }) =>
    directoryHref(locale, {
      tab: "people",
      q,
      page,
      person: personId,
      ...params,
    })

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
      <Panel flush>
        <div className="border-b border-border p-3">
          <SearchForm
            locale={locale}
            tab="people"
            q={q}
            placeholder={messages.searchPeople}
            messages={messages}
          />
        </div>
        {people.length === 0 ? (
          <div className="px-5 py-4">
            <Empty>{messages.noResults}</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">
                    {m.name}
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    {m.roles}
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2.5 font-medium sm:table-cell"
                  >
                    {m.units}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {people.map((p) => (
                  <tr
                    key={p.id}
                    aria-current={p.id === personId ? "true" : undefined}
                    className="hover:bg-muted/50 aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground"
                  >
                    <th scope="row" className="px-4 py-2.5 font-normal sm:px-6">
                      <Link
                        href={href({ person: p.id, page })}
                        prefetch={false}
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {m.types[p.type as keyof typeof m.types] ?? p.type}
                        {p.email && ` · ${p.email}`}
                      </p>
                    </th>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {p.roles.map((role) => (
                          <Badge key={role} variant="secondary">
                            {m.roleNames[role] ?? role}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell">
                      {p.units
                        .slice(0, 2)
                        .map((u) => `${u.street} ${u.identifier}`)
                        .join(", ")}
                      {p.units.length > 2 && ` +${p.units.length - 2}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={page}
          hasNext={rows.length > DIRECTORY_PAGE_SIZE}
          href={(n) => directoryHref(locale, { tab: "people", q, page: n })}
          messages={messages}
        />
      </Panel>

      {person ? (
        <PersonDetail
          person={person}
          locale={locale}
          messages={messages}
          format={format}
        />
      ) : (
        <Panel>
          <Empty>{m.select}</Empty>
        </Panel>
      )}
    </div>
  )
}

function PersonDetail({
  person: { party, leases, ownerships, mandates, consents },
  locale,
  messages,
  format,
}: {
  person: NonNullable<Awaited<ReturnType<typeof getPerson>>>
  locale: string
  messages: DirectoryMessages
  format: DirectoryFormat
}) {
  const m = messages.person
  const isTenant = leases.some(
    (l) => l.role === "tenant" || l.role === "co_tenant"
  )
  const unitLink = (unitId: string, label: string) => (
    <Link
      href={directoryHref(locale, { unit: unitId })}
      className="font-medium underline-offset-4 hover:underline"
    >
      {label}
    </Link>
  )
  const period = (start: string, end: string | null) =>
    fm(m.period, {
      start: format.day(start),
      end: end ? format.day(end) : m.ongoing,
    })

  return (
    <Panel
      title={party.name}
      description={m.types[party.type as keyof typeof m.types] ?? party.type}
      action={
        isTenant && (
          <Link
            href={`/${locale}/portal/${party.id}`}
            className={buttonVariants({ variant: "outline" })}
          >
            {m.openPortal} →
          </Link>
        )
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Fact label={m.email} value={party.email ?? "–"} />
        <Fact label={m.phone} value={party.phone ?? "–"} />
        <Fact label={m.language} value={party.language ?? "–"} />
        <Fact
          label={m.whatsapp}
          value={party.whatsappOptIn ? m.optedIn : m.notOptedIn}
        />
      </dl>

      <Separator className="my-4" />
      <GroupLabel>{m.leases}</GroupLabel>
      {leases.length === 0 ? (
        <Empty>{messages.none}</Empty>
      ) : (
        <ul className="space-y-2 text-sm">
          {leases.map((l) => (
            <li key={`${l.leaseId}-${l.role}`}>
              {unitLink(l.unitId, `${l.address} · ${l.unit}`)}
              <p className="text-xs text-muted-foreground">
                {m.roleNames[l.role as keyof typeof m.roleNames] ?? l.role} ·{" "}
                {fm(m.coldRent, { rent: format.eur(l.rentColdEur) })} ·{" "}
                {period(l.startDate, l.endDate)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Separator className="my-4" />
      <GroupLabel>{m.ownerships}</GroupLabel>
      {ownerships.length === 0 ? (
        <Empty>{messages.none}</Empty>
      ) : (
        <ul className="space-y-2 text-sm">
          {ownerships.map((o) => (
            <li key={`${o.unitId}-${o.validFrom}`}>
              {unitLink(o.unitId, `${o.address} · ${o.unit}`)}
              <p className="text-xs text-muted-foreground">
                {o.meaShare != null &&
                  `${fm(m.meaShare, { share: format.number(Number(o.meaShare)) })} · `}
                {period(o.validFrom, o.validTo)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {mandates.length > 0 && (
        <>
          <Separator className="my-4" />
          <GroupLabel>{m.mandates}</GroupLabel>
          <ul className="space-y-2 text-sm">
            {mandates.map((d) => (
              <li key={d.id}>
                <span className="font-medium">{d.address}</span>
                <p className="text-xs text-muted-foreground">
                  {m.mandateTypes[d.type as keyof typeof m.mandateTypes] ??
                    d.type}
                  {d.approvalLimitEur != null &&
                    ` · ${fm(m.approvalLimit, { amount: format.eur(d.approvalLimitEur) })}`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {consents.length > 0 && (
        <>
          <Separator className="my-4" />
          <GroupLabel>{m.consents}</GroupLabel>
          <ul className="space-y-2 text-sm">
            {consents.map((c) => (
              <li key={c.id}>
                {fm(m.consentLine, {
                  partner: c.partner,
                  channel: c.channel,
                  fields: c.dataShared.join(", "),
                })}
                <p className="text-xs text-muted-foreground">
                  {format.dateTime(c.givenAt)}
                  {c.revokedAt &&
                    ` · ${messages.unit.withdrawn} ${format.dateTime(c.revokedAt)}`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

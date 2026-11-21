import { Fragment, type ReactNode } from "react"

import {
  documentRef,
  ISSUER,
  tenancyStatus,
  type ConsentRecord,
  type DocumentParty,
  type DocumentRecord,
  type EnergyRecord,
  type ManagementRecord,
  type OwnerSheetRecord,
  type TenancyRecord,
} from "@/lib/centrix/documents"
import { formatMessage as fm } from "@/lib/i18n/format-message"
import { cn } from "@/lib/utils"

import type { DocumentFormat, DocumentMessages } from "./format"
import {
  Checked,
  Facts,
  Letterhead,
  Note,
  P,
  Section,
  Signatures,
  Table,
  Title,
} from "./sheet"

type Copy = { m: DocumentMessages; f: DocumentFormat }

const issuerAddress = `${ISSUER.street}, ${ISSUER.postcode} ${ISSUER.city}`

/** The document's title, for the browser tab and the toolbar. */
export function documentTitle(record: DocumentRecord, m: DocumentMessages) {
  switch (record.kind) {
    case "lease":
      return m.lease.title
    case "registration":
      return m.registration.title
    case "rent_certificate":
      return m.rentCertificate.title
    case "handover":
      return m.handover.title
    case "guarantee":
      return m.guarantee.title
    case "management":
      return record.data.mandate.type === "weg"
        ? m.management.titles.weg
        : m.management.titles.rental
    case "energy":
      return m.energy.title
    case "consent":
      return m.consent.title
    case "owner_sheet":
      return m.ownerSheet.title
  }
}

/** The filled document for any record. */
export function DocumentBody({
  record,
  m,
  f,
}: { record: DocumentRecord } & Copy) {
  const copy = { m, f }
  switch (record.kind) {
    case "lease":
      return <Lease d={record.data} {...copy} />
    case "registration":
      return <Registration d={record.data} {...copy} />
    case "rent_certificate":
      return <RentCertificate d={record.data} {...copy} />
    case "handover":
      return <Handover d={record.data} {...copy} />
    case "guarantee":
      return (
        <Guarantee d={record.data} guarantor={record.guarantor} {...copy} />
      )
    case "management":
      return <Management d={record.data} {...copy} />
    case "energy":
      return <Energy d={record.data} {...copy} />
    case "consent":
      return <Consent d={record.data} {...copy} />
    case "owner_sheet":
      return <OwnerSheet d={record.data} {...copy} />
  }
}

// --- Shared pieces ----------------------------------------------------------------------

/** One value per line. */
function Lines({ items }: { items: ReactNode[] }) {
  return items.map((item, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {item}
    </Fragment>
  ))
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-neutral-500">{children}</span>
}

const tenantsLabel = (d: TenancyRecord, m: DocumentMessages) =>
  d.tenants.length > 1 ? m.common.tenants : m.common.tenant

/** Landlord and tenants of a tenancy. */
function tenancyParties(d: TenancyRecord, { m }: Copy) {
  return [
    [
      m.common.landlord,
      <>
        {d.landlord?.name ?? m.common.none}
        <br />
        <Muted>{fm(m.common.representedBy, { manager: ISSUER.name })}</Muted>
      </>,
    ],
    [
      tenantsLabel(d, m),
      <Lines key="tenants" items={d.tenants.map((t) => t.name)} />,
    ],
  ] satisfies [ReactNode, ReactNode][]
}

/** The flat: address, unit and floor, rooms and size. */
function flatFacts(d: TenancyRecord, { m, f }: Copy) {
  return [
    [m.common.address, d.property.address],
    [m.common.flat, f.flat(d.unit.identifier, d.unit.floor)],
    [m.common.rooms, d.unit.rooms ?? "–"],
    [
      m.common.livingSpace,
      d.unit.sizeSqm === null
        ? "–"
        : fm(m.common.livingSpaceValue, { size: f.number(d.unit.sizeSqm) }),
    ],
  ] satisfies [ReactNode, ReactNode][]
}

function meterType(type: string, m: DocumentMessages) {
  return type in m.common.meterTypes
    ? m.common.meterTypes[type as keyof typeof m.common.meterTypes]
    : type
}

/** Place and date line, then the landlord's and each tenant's signature. */
function tenancySignatures(d: TenancyRecord, m: DocumentMessages) {
  const place = { label: m.common.placeBlank }
  return [
    place,
    { label: fm(m.common.signatureLandlord, { manager: ISSUER.name }) },
    ...d.tenants.flatMap((t) => [
      place,
      { label: fm(m.common.signatureTenant, { name: t.name }) },
    ]),
  ]
}

const reference = (
  m: DocumentMessages,
  kind: Parameters<typeof documentRef>[0],
  id: string
) => fm(m.ref, { ref: documentRef(kind, id) })

const issuedIn = (m: DocumentMessages, f: DocumentFormat, day: string) =>
  fm(m.common.placeDate, { place: ISSUER.city, date: f.day(day) })

// --- Tenancy documents ------------------------------------------------------------------

function Lease({ d, m, f }: { d: TenancyRecord } & Copy) {
  const l = m.lease
  const ended = d.lease.endDate !== null && d.lease.endDate < d.today
  return (
    <>
      <Letterhead reference={reference(m, "lease", d.lease.id)} />
      <Title>{l.title}</Title>
      <Facts rows={tenancyParties(d, { m, f })} />
      {ended && <Note>{fm(l.ended, { date: f.day(d.lease.endDate!) })}</Note>}

      <Section title={l.premisesTitle}>
        <P>{l.premises}</P>
        <Facts
          rows={[
            ...flatFacts(d, { m, f }),
            ...(d.meters.length > 0
              ? ([
                  [
                    m.common.meters,
                    <Lines
                      key="meters"
                      items={d.meters.map(
                        (x) => `${meterType(x.type, m)} · ${x.number}`
                      )}
                    />,
                  ],
                ] satisfies [ReactNode, ReactNode][])
              : []),
          ]}
        />
      </Section>
      <Section title={l.termTitle}>
        <P>{fm(l.term, { start: f.day(d.lease.startDate) })}</P>
      </Section>
      <Section title={l.rentTitle}>
        <P>{fm(l.rent, { rent: f.eur(d.lease.rentColdEur) })}</P>
        <P>{l.rentDue}</P>
      </Section>
      <Section title={l.securityTitle}>
        <P>
          {d.guarantors.length > 0
            ? fm(l.guaranteed, {
                deposit: f.threeRents(d.lease.rentColdEur),
                guarantors: f.list(d.guarantors.map((g) => g.name)),
              })
            : fm(l.deposit, { deposit: f.threeRents(d.lease.rentColdEur) })}
        </P>
      </Section>
      <Section title={l.managementTitle}>
        <P>{fm(l.management, { manager: ISSUER.name })}</P>
      </Section>
      <Signatures lines={tenancySignatures(d, m)} />
    </>
  )
}

/** A move-in confirmation is issued on the move-in day, or now when issued in advance. */
const registrationDay = (d: TenancyRecord) =>
  d.lease.startDate <= d.today ? d.lease.startDate : d.today

function Registration({ d, m, f }: { d: TenancyRecord } & Copy) {
  const r = m.registration
  const issued = issuedIn(m, f, registrationDay(d))
  return (
    <>
      <Letterhead
        reference={reference(m, "registration", d.lease.id)}
        dateLine={issued}
      />
      <Title subtitle={r.subtitle}>{r.title}</Title>
      <Facts
        rows={[
          [
            r.landlord,
            fm(r.landlordValue, {
              name: d.landlord?.name ?? m.common.none,
              manager: ISSUER.name,
              address: issuerAddress,
            }),
          ],
          [r.authorised, `${ISSUER.name}, ${issuerAddress}`],
          [r.event, fm(r.moveIn, { date: f.day(d.lease.startDate) })],
          [
            r.flatAddress,
            <Lines
              key="flat"
              items={[
                d.property.address,
                f.flat(d.unit.identifier, d.unit.floor),
              ]}
            />,
          ],
          [
            r.persons,
            <Lines key="persons" items={d.tenants.map((t) => t.name)} />,
          ],
        ]}
      />
      {d.landlord && (
        <div className="mt-4">
          <Checked>{r.isOwner}</Checked>
        </div>
      )}
      <Section>
        <P>{r.declaration}</P>
        <p className="text-xs text-pretty text-neutral-500">{r.warning}</p>
      </Section>
      <Signatures
        lines={[
          { label: m.common.placeBlank, value: issued },
          { label: r.signature },
        ]}
      />
    </>
  )
}

function RentCertificate({ d, m, f }: { d: TenancyRecord } & Copy) {
  const r = m.rentCertificate
  const status = tenancyStatus(d.lease, d.today)
  const values = {
    tenants: f.list(d.tenants.map((t) => t.name)),
    start: f.day(d.lease.startDate),
    end: d.lease.endDate ? f.day(d.lease.endDate) : "",
  }
  const statusText =
    status === "upcoming"
      ? fm(r.begins, { date: values.start })
      : status === "ended"
        ? fm(r.endedOn, { date: values.end })
        : d.lease.endDate
          ? fm(r.ends, { date: values.end })
          : r.ongoing
  return (
    <>
      <Letterhead
        reference={reference(m, "rent_certificate", d.lease.id)}
        dateLine={issuedIn(m, f, d.today)}
      />
      <Title>{r.title}</Title>
      <P>{fm(r[status], values)}</P>
      <div className="mt-5">
        <Facts
          rows={[
            ...flatFacts(d, { m, f }),
            [m.common.netRent, f.eur(d.lease.rentColdEur)],
            [m.common.landlord, d.landlord?.name ?? m.common.none],
            [r.status, statusText],
          ]}
        />
      </div>
      <Section>
        <P>{r.purpose}</P>
      </Section>
      <Signatures lines={[{ label: ISSUER.name }]} />
    </>
  )
}

function Handover({ d, m, f }: { d: TenancyRecord } & Copy) {
  const h = m.handover
  return (
    <>
      <Letterhead reference={reference(m, "handover", d.lease.id)} />
      <Title>{h.title}</Title>
      <Facts
        rows={[
          [h.date, f.day(d.lease.startDate)],
          [m.common.address, d.property.address],
          [m.common.flat, f.flat(d.unit.identifier, d.unit.floor)],
          ...tenancyParties(d, { m, f }),
        ]}
      />
      <Section title={h.metersTitle}>
        {d.meters.length > 0 ? (
          <Table
            head={[h.meter, h.number, h.reading]}
            rows={d.meters.map((x) => [meterType(x.type, m), x.number, ""])}
          />
        ) : (
          <P>{h.noMeters}</P>
        )}
      </Section>
      <Section title={h.keysTitle}>
        <Table
          head={[h.key, h.count]}
          rows={[
            [h.keys.building, ""],
            [h.keys.flat, ""],
            [h.keys.letterbox, ""],
            [h.keys.cellar, ""],
          ]}
        />
      </Section>
      <Section title={h.roomsTitle}>
        <Table
          head={[h.room, h.condition]}
          rows={[
            [fm(h.rooms.living, { count: String(d.unit.rooms ?? "–") }), ""],
            [h.rooms.kitchen, ""],
            [h.rooms.bathroom, ""],
            [h.rooms.hallway, ""],
          ]}
        />
      </Section>
      <Note>
        {fm(h.prepared, {
          manager: ISSUER.name,
          date: f.day(d.lease.startDate),
        })}
      </Note>
      <Signatures lines={tenancySignatures(d, m)} />
    </>
  )
}

function Guarantee({
  d,
  guarantor,
  m,
  f,
}: { d: TenancyRecord; guarantor: DocumentParty } & Copy) {
  const g = m.guarantee
  return (
    <>
      <Letterhead
        reference={`${reference(m, "guarantee", d.lease.id)}-${guarantor.id
          .slice(-4)
          .toUpperCase()}`}
      />
      <Title>{g.title}</Title>
      <Facts
        rows={[
          [g.guarantor, guarantor.name],
          ...tenancyParties(d, { m, f }),
          [m.common.address, d.property.address],
          [m.common.flat, f.flat(d.unit.identifier, d.unit.floor)],
          [g.start, f.day(d.lease.startDate)],
          [m.common.netRent, f.eur(d.lease.rentColdEur)],
        ]}
      />
      <Section>
        <P>{g.body}</P>
        <P>{fm(g.cap, { cap: f.threeRents(d.lease.rentColdEur) })}</P>
        <P>{g.end}</P>
      </Section>
      <Signatures
        lines={[
          { label: m.common.placeBlank },
          { label: fm(g.signature, { name: guarantor.name }) },
        ]}
      />
    </>
  )
}

// --- Property and owner documents -------------------------------------------------------

function Management({ d, m, f }: { d: ManagementRecord } & Copy) {
  const g = m.management
  const isWeg = d.mandate.type === "weg"
  const space = d.units.reduce((sum, u) => sum + (u.sizeSqm ?? 0), 0)
  return (
    <>
      <Letterhead reference={reference(m, "management", d.mandate.id)} />
      <Title>{isWeg ? g.titles.weg : g.titles.rental}</Title>
      <Facts
        rows={[
          [g.client, d.client.name],
          [
            g.manager,
            <Lines
              key="manager"
              items={[ISSUER.name, <Muted key="a">{issuerAddress}</Muted>]}
            />,
          ],
          [g.property, d.property.address],
          [
            g.units,
            isWeg
              ? fm(g.allUnits, { count: f.number(d.propertyUnitCount) })
              : d.units.length > 0
                ? d.units.map((u) => u.identifier).join(", ")
                : m.common.none,
          ],
          [
            g.livingSpace,
            space > 0
              ? fm(m.common.livingSpaceValue, { size: f.number(space) })
              : "–",
          ],
        ]}
      />
      <Section title={g.dutiesTitle}>
        <P>{isWeg ? g.duties.weg : g.duties.rental}</P>
      </Section>
      <Section title={g.limitTitle}>
        <P>
          {d.mandate.approvalLimitEur === null
            ? g.noLimit
            : fm(g.limit, { limit: f.eur(d.mandate.approvalLimitEur) })}
        </P>
      </Section>
      <Section title={g.communicationTitle}>
        <P>{g.communication}</P>
      </Section>
      <Signatures
        lines={[
          { label: m.common.placeBlank },
          { label: fm(g.signatureClient, { name: d.client.name }) },
          { label: m.common.placeBlank },
          { label: fm(g.signatureManager, { manager: ISSUER.name }) },
        ]}
      />
    </>
  )
}

/** GEG efficiency classes for residential buildings, by final energy in kWh/(m²·a). */
const ENERGY_CLASSES = [
  { name: "A+", min: null, max: 30, color: "bg-green-700" },
  { name: "A", min: 30, max: 50, color: "bg-green-600" },
  { name: "B", min: 50, max: 75, color: "bg-lime-500" },
  { name: "C", min: 75, max: 100, color: "bg-lime-400" },
  { name: "D", min: 100, max: 130, color: "bg-yellow-400" },
  { name: "E", min: 130, max: 160, color: "bg-amber-400" },
  { name: "F", min: 160, max: 200, color: "bg-orange-500" },
  { name: "G", min: 200, max: 250, color: "bg-red-500" },
  { name: "H", min: 250, max: null, color: "bg-red-700" },
] as const

function energyRange(
  c: (typeof ENERGY_CLASSES)[number],
  { m, f }: Copy
): string {
  if (c.min === null) return fm(m.energy.below, { max: f.number(c.max) })
  if (c.max === null) return fm(m.energy.above, { min: f.number(c.min) })
  return fm(m.energy.between, { min: f.number(c.min), max: f.number(c.max) })
}

function heatingLabel(raw: string | null, m: DocumentMessages) {
  if (!raw) return m.common.none
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_")
  return key in m.energy.heatingTypes
    ? m.energy.heatingTypes[key as keyof typeof m.energy.heatingTypes]
    : raw
}

function Energy({ d, m, f }: { d: EnergyRecord } & Copy) {
  const e = m.energy
  const current = ENERGY_CLASSES.find((c) => c.name === d.building.energyClass)
  return (
    <>
      <Letterhead
        reference={reference(m, "energy", d.building.id)}
        dateLine={fm(m.common.asOf, { date: f.day(d.today) })}
      />
      <Title subtitle={e.subtitle}>{e.title}</Title>
      <Facts
        rows={[
          [m.common.address, d.property.address],
          ...(d.building.number !== null
            ? ([
                [
                  e.building,
                  fm(e.buildingValue, {
                    number: f.number(d.building.number),
                    total: f.number(d.building.of),
                  }),
                ],
              ] satisfies [ReactNode, ReactNode][])
            : []),
          [e.year, d.building.buildingYear ?? m.common.none],
          [e.heating, heatingLabel(d.building.heatingType, m)],
          [e.units, f.number(d.unitCount)],
          [
            e.livingSpace,
            d.livingSpaceSqm > 0
              ? fm(m.common.livingSpaceValue, {
                  size: f.number(d.livingSpaceSqm),
                })
              : "–",
          ],
        ]}
      />
      <Section title={fm(e.classTitle, { class: d.building.energyClass })}>
        <ol className="mt-2 space-y-1" aria-label={e.title}>
          {ENERGY_CLASSES.map((c, i) => {
            const isCurrent = c.name === current?.name
            return (
              <li key={c.name} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-5 items-center px-2 text-[11px] font-medium text-white",
                    c.color
                  )}
                  style={{ width: `${22 + i * 8}%` }}
                >
                  {c.name}
                </span>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    isCurrent ? "font-medium" : "text-neutral-500"
                  )}
                >
                  {energyRange(c, { m, f })}
                  {isCurrent && " ◀"}
                </span>
              </li>
            )
          })}
        </ol>
        {current && (
          <P>{fm(e.classRange, { range: energyRange(current, { m, f }) })}</P>
        )}
      </Section>
      <Note>{e.note}</Note>
    </>
  )
}

function Consent({ d, m, f }: { d: ConsentRecord } & Copy) {
  const c = m.consent
  const purpose =
    d.partner.category in c.purposes
      ? c.purposes[d.partner.category as keyof typeof c.purposes]
      : (d.consent.purpose ?? m.common.none)
  const channel =
    d.consent.channel in c.channels
      ? c.channels[d.consent.channel as keyof typeof c.channels]
      : d.consent.channel
  return (
    <>
      <Letterhead
        reference={reference(m, "consent", d.consent.id)}
        dateLine={fm(m.common.asOf, { date: f.day(d.today) })}
      />
      <Title>{c.title}</Title>
      <Facts
        rows={[
          [c.person, d.party.name],
          [c.partner, d.partner.name],
          [c.purpose, purpose],
          ...(d.product
            ? ([[c.product, d.product]] satisfies [ReactNode, ReactNode][])
            : []),
          ...(d.property && d.unit
            ? ([
                [
                  m.common.flat,
                  <Lines
                    key="flat"
                    items={[d.property.address, f.flat(d.unit, null)]}
                  />,
                ],
              ] satisfies [ReactNode, ReactNode][])
            : []),
          [c.channel, channel],
          [c.givenAt, f.dateTime(d.consent.givenAt)],
          [
            c.status,
            d.consent.revokedAt
              ? fm(c.withdrawn, { date: f.dateTime(d.consent.revokedAt) })
              : c.active,
          ],
        ]}
      />
      <Section title={c.shared}>
        <ul className="list-disc space-y-0.5 pl-5">
          {d.consent.dataShared.map((field) => (
            <li key={field}>
              {field in c.fields
                ? c.fields[field as keyof typeof c.fields]
                : field}
            </li>
          ))}
        </ul>
      </Section>
      <Section>
        <P>{c.body}</P>
        <P>{c.withdrawal}</P>
      </Section>
    </>
  )
}

function OwnerSheet({ d, m, f }: { d: OwnerSheetRecord } & Copy) {
  const o = m.ownerSheet
  const hasShares = d.ownerships.some((x) => f.mea(x.meaShare) !== null)
  return (
    <>
      <Letterhead
        reference={reference(m, "owner_sheet", d.party.id)}
        dateLine={fm(m.common.asOf, { date: f.day(d.today) })}
      />
      <Title>{o.title}</Title>
      <Facts
        rows={[
          [o.owner, d.party.name],
          [
            o.type,
            d.party.type in o.types
              ? o.types[d.party.type as keyof typeof o.types]
              : d.party.type,
          ],
          [o.email, d.party.email ?? "–"],
          [o.phone, d.party.phone ?? "–"],
        ]}
      />
      <Section title={o.ownershipsTitle}>
        <Table
          head={[o.property, o.unit, o.livingSpace, o.share, o.period]}
          rows={d.ownerships.map((x) => [
            x.address,
            x.unit,
            x.sizeSqm === null ? "–" : `${f.number(x.sizeSqm)} m²`,
            f.mea(x.meaShare) ?? "–",
            x.validTo
              ? fm(o.range, {
                  start: f.day(x.validFrom),
                  end: f.day(x.validTo),
                })
              : fm(o.since, { date: f.day(x.validFrom) }),
          ])}
        />
        {hasShares && <p className="text-xs text-neutral-500">{o.shareNote}</p>}
      </Section>
      {d.mandates.length > 0 && (
        <Section title={o.mandatesTitle}>
          <Table
            head={[o.property, o.mandate, o.limit]}
            rows={d.mandates.map((x) => [
              x.address,
              x.type in o.mandateTypes
                ? o.mandateTypes[x.type as keyof typeof o.mandateTypes]
                : x.type,
              x.approvalLimitEur === null ? "–" : f.eur(x.approvalLimitEur),
            ])}
          />
        </Section>
      )}
    </>
  )
}

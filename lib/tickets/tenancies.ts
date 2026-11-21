import "server-only"

import { and, asc, eq, gte, isNull, lte, or, sql, type SQL } from "drizzle-orm"

import type { Exec } from "@/lib/db"
import {
  leaseParties,
  leases,
  parties,
  properties,
  units,
} from "@/lib/db/schema/portfolio"
import { toDay } from "@/lib/time"

function activeTenancies(db: Exec, on: Date, filter?: SQL) {
  const day = toDay(on)
  return db
    .selectDistinct({
      partyId: parties.id,
      unitId: units.id,
      propertyId: properties.id,
      tenantName: parties.name,
      propertyAddress: properties.address,
      unitIdentifier: units.identifier,
    })
    .from(leaseParties)
    .innerJoin(parties, eq(parties.id, leaseParties.partyId))
    .innerJoin(leases, eq(leases.id, leaseParties.leaseId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(
      and(
        eq(leaseParties.role, "tenant"),
        lte(leases.startDate, day),
        or(isNull(leases.endDate), gte(leases.endDate, day)),
        filter
      )
    )
    .$dynamic()
}

export function listTicketTenancies(db: Exec) {
  return activeTenancies(db, new Date()).orderBy(
    asc(properties.address),
    asc(units.identifier),
    asc(parties.name)
  )
}

export async function findTicketTenancy(
  db: Exec,
  partyId: string,
  unitId: string
) {
  const [tenant] = await activeTenancies(
    db,
    new Date(),
    and(eq(parties.id, partyId), eq(units.id, unitId))
  ).limit(1)
  return tenant ?? null
}

export async function matchWhatsAppTenancy(
  db: Exec,
  senderPhone: string,
  receivedAt: Date
) {
  const phone = senderPhone.replace(/^\+/, "")
  if (!/^[1-9]\d{6,14}$/.test(phone)) return null

  const matches = await activeTenancies(
    db,
    receivedAt,
    and(
      sql`trim(${parties.phone}) ~ ${"^[+]?[1-9][0-9(). -]*$"}`,
      sql`regexp_replace(${parties.phone}, '[^0-9]', '', 'g') = ${phone}`
    )
  ).limit(2)
  return matches.length === 1 ? matches[0] : null
}

import type { RegisteredPartner } from "@/lib/connectors/registry"
import type { Manifest, Offer, ShareableField } from "@/lib/connectors/spec"
import type { UnitSnapshot } from "@/lib/centrix/repository"
import { addBusinessDays, businessDaysBetween } from "@/lib/time"

/**
 * The offer shown to the tenant, snapshotted on the workflow run. Amounts are integer
 * cents here (they come from the manifest); they become EUR decimals only when written
 * to a money column.
 */
export type ComputedOffer = {
  partner_id: string // partners.id (uuid)
  partner_slug: string // manifest id
  partner_name: string
  category: Manifest["category"]
  offer_id: string // offer id within the manifest
  db_offer_id: string // partner_offers.id (uuid)
  product: string
  description: string | null
  monthly_price_cents: number
  one_time_fee_cents: number
  contract_months: number
  target_date: string // what the resident needs (e.g. move-in day)
  earliest_activation: string
  start_date: string // what we will actually order
  on_time: boolean
  business_days_available: number
  lead_time_business_days: number
  bridge: {
    product: string
    monthly_price_cents: number
    ready_by: string
    until: string
  } | null
  required_context: ShareableField[]
  purpose: string
}

export type Ineligible = { offer_id: string; reasons: string[] }

export function checkEligibility(
  offer: Offer,
  snapshot: UnitSnapshot
): string[] {
  const reasons: string[] = []
  const e = offer.eligibility
  const postcode = snapshot.property.postcode
  if (!postcode) reasons.push("postcode unknown")
  else if (!e.postcode_prefixes.some((p) => postcode.startsWith(p)))
    reasons.push("postcode not covered")
  if (e.min_size_sqm != null && (snapshot.unit.size_sqm ?? 0) < e.min_size_sqm)
    reasons.push("unit too small")
  if (
    e.heating_types &&
    !e.heating_types.includes(snapshot.property.heating ?? "")
  )
    reasons.push("heating type not supported")
  return reasons
}

/**
 * Picks the partner's first eligible offer (manifest order = partner's preference) and
 * works out whether it can be live by the target date. If not, and the partner offers a
 * bridge, the bridge covers the gap. `referenceDay` is the day the order would be placed.
 */
export function computeOffer(
  partner: RegisteredPartner,
  snapshot: UnitSnapshot,
  referenceDay: string,
  targetDay: string
): { offer: ComputedOffer | null; ineligible: Ineligible[] } {
  const manifest = partner.manifest
  const ineligible: Ineligible[] = []
  for (const o of manifest.offers) {
    const dbOfferId = partner.offerIds[o.id]
    if (!dbOfferId) {
      ineligible.push({ offer_id: o.id, reasons: ["offer not registered"] })
      continue
    }
    const reasons = checkEligibility(o, snapshot)
    if (reasons.length) {
      ineligible.push({ offer_id: o.id, reasons })
      continue
    }
    const earliest = addBusinessDays(referenceDay, o.lead_time_business_days)
    const onTime = earliest <= targetDay
    const start = onTime ? targetDay : earliest
    let bridge: ComputedOffer["bridge"] = null
    if (!onTime && o.bridge) {
      const readyBy = addBusinessDays(
        referenceDay,
        o.bridge.lead_time_business_days
      )
      bridge = {
        product: o.bridge.product,
        monthly_price_cents: o.bridge.monthly_price_cents,
        ready_by: readyBy,
        until: start,
      }
    }
    return {
      offer: {
        partner_id: partner.partnerId,
        partner_slug: manifest.id,
        partner_name: manifest.legal_entity,
        category: manifest.category,
        offer_id: o.id,
        db_offer_id: dbOfferId,
        product: o.product,
        description: o.description ?? null,
        monthly_price_cents: o.monthly_price_cents,
        one_time_fee_cents: o.one_time_fee_cents,
        contract_months: o.contract_months,
        target_date: targetDay,
        earliest_activation: earliest,
        start_date: start,
        on_time: onTime,
        business_days_available: businessDaysBetween(referenceDay, targetDay),
        lead_time_business_days: o.lead_time_business_days,
        bridge,
        required_context: manifest.required_context,
        purpose: manifest.purpose,
      },
      ineligible,
    }
  }
  return { offer: null, ineligible }
}

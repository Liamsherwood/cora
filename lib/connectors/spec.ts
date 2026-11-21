import { z } from "zod"

import { isCalendarDay } from "@/lib/time"

/**
 * centrix Partner Connector Spec v1.
 *
 * A partner plugs into centrix by shipping ONE manifest that satisfies this schema.
 * No code changes are needed on our side: the workflow engine reads triggers,
 * eligibility, required context and the order channel from the manifest.
 */

export const CATEGORIES = [
  "internet",
  "energy",
  "insurance",
  "repair",
  "moving",
  "heat_pump",
] as const

/** Events centrix can emit. Partners subscribe to the moments that matter for them. */
export const TRIGGERS = [
  "tenant.move_in",
  "tenant.move_out",
  "contract.expiring",
  "statement.annual_received",
  "case.created",
] as const

/**
 * Context fields centrix can share, and nothing else. Each one needs the tenant's
 * consent before it leaves centrix (data minimisation, GDPR Art. 5(1)(c)).
 */
export const SHAREABLE_FIELDS = [
  "name",
  "email",
  "phone",
  "address",
  "move_in_date",
  "floor",
  "unit_size_sqm",
  "meter_number",
] as const

/** Statuses a partner may report back. Mapped onto workflow states by the engine. */
export const PARTNER_STATUSES = [
  "accepted",
  "scheduled",
  "active",
  "rejected",
] as const

const isoDay = z
  .string()
  .refine(isCalendarDay, "expected a real calendar day as YYYY-MM-DD")

export const EligibilitySchema = z
  .object({
    postcode_prefixes: z.array(z.string().regex(/^\d{1,5}$/)).min(1),
    min_size_sqm: z.number().int().positive().optional(),
    heating_types: z.array(z.string()).optional(),
  })
  .strict()

export const OfferSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    product: z.string().min(1),
    description: z.string().optional(),
    monthly_price_cents: z.number().int().nonnegative(),
    one_time_fee_cents: z.number().int().nonnegative().default(0),
    contract_months: z.number().int().positive(),
    /** Working days the partner needs from order to activation. */
    lead_time_business_days: z.number().int().nonnegative(),
    eligibility: EligibilitySchema,
    /** Optional stop-gap if activation can't happen by the target date (e.g. 5G router). */
    bridge: z
      .object({
        product: z.string(),
        monthly_price_cents: z.number().int().nonnegative(),
        lead_time_business_days: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const ManifestSchema = z
  .object({
    spec_version: z.literal("1.0"),
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    legal_entity: z.string().min(1),
    category: z.enum(CATEGORIES),
    triggers: z.array(z.enum(TRIGGERS)).min(1),
    /** How many days before the trigger date we should reach the resident. */
    contact_window_days_before: z.number().int().nonnegative(),
    /** Fields the partner needs to place the order. Asked for in the consent step. */
    required_context: z.array(z.enum(SHAREABLE_FIELDS)).min(1),
    purpose: z.string().min(10),
    offers: z.array(OfferSchema).min(1),
    order: z
      .object({
        channel: z.enum(["webhook", "email", "dashboard"]),
        endpoint: z.string().url().optional(),
      })
      .strict(),
    status_updates: z
      .object({
        channel: z.literal("webhook"),
        statuses: z.array(z.enum(PARTNER_STATUSES)).min(1),
        signature: z.literal("hmac-sha256"),
      })
      .strict(),
    sla: z
      .object({
        accept_within_hours: z.number().positive(),
      })
      .strict(),
    support_contact: z.string().email(),
  })
  .strict()
  .superRefine((m, ctx) => {
    const ids = new Set<string>()
    for (const o of m.offers) {
      if (ids.has(o.id))
        ctx.addIssue({
          code: "custom",
          message: `duplicate offer id ${o.id}`,
          path: ["offers"],
        })
      ids.add(o.id)
    }
    if (
      !m.status_updates.statuses.includes("active") &&
      !m.status_updates.statuses.includes("rejected")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "partner must report at least a terminal status",
        path: ["status_updates"],
      })
    }
  })

export type Manifest = z.infer<typeof ManifestSchema>
export type Offer = z.infer<typeof OfferSchema>
export type ShareableField = (typeof SHAREABLE_FIELDS)[number]
export type PartnerStatus = (typeof PARTNER_STATUSES)[number]

/** Partner -> centrix status webhook body. */
export const StatusUpdateSchema = z
  .object({
    order_id: z.string().min(1),
    status: z.enum(PARTNER_STATUSES),
    /** Unique per delivery; replays with the same id are ignored. */
    event_id: z.string().min(8),
    occurred_at: z.string().datetime({ offset: true }),
    activation_date: isoDay.optional(),
    note: z.string().max(500).optional(),
  })
  .strict()

export type StatusUpdate = z.infer<typeof StatusUpdateSchema>

export { isoDay }

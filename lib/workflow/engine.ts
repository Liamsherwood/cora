import { and, asc, eq, inArray, type SQL } from "drizzle-orm"

import type { DB, Exec, Tx } from "@/lib/db"
import * as t from "@/lib/db/schema"
import {
  getUnitSnapshot,
  insertEvent,
  type UnitSnapshot,
} from "@/lib/centrix/repository"
import {
  getPartnerById,
  getPartnerBySlug,
  listPartners,
  type RegisteredPartner,
} from "@/lib/connectors/registry"
import type { ShareableField, StatusUpdate } from "@/lib/connectors/spec"
import { conflict, notFound, unprocessable } from "@/lib/errors"
import { isUuid, newId } from "@/lib/ids"
import { centsToEur, eurToCents, formatEur } from "@/lib/money"
import { addDays, clock, now, toDay } from "@/lib/time"

import { buildSharedPayload, FIELD_LABELS } from "./minimize"
import { computeOffer, type ComputedOffer } from "./offers"
import { isState, predecessorsOf, TERMINAL, type State } from "./states"

export type Channel = "voice" | "portal" | "email" | "whatsapp" | "centrix"
export type Actor = "system" | "ai" | "tenant" | "partner" | "property_manager"

/** Rough unit costs for the cost-per-case counter (assumptions, shown in the UI). */
export const COSTS = {
  voiceCentsPerMinute: Number(process.env.VOICE_COST_CENTS_PER_MIN ?? 12),
  assumedCallMinutes: 2.5,
  manualBaselineContacts: 12,
  manualMinutesPerContact: 4,
  managerHourlyCents: 3500,
}

// ------------------------------------------------------------------ helpers

type RunRow = typeof t.workflowRuns.$inferSelect
/** A workflow run plus the unit and party of the event that started it. */
export type Run = RunRow & { unitId: string; partyId: string }

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === "23505" || err?.cause?.code === "23505"
}

/**
 * Loads a run. With `lock`, takes a row lock on the run (inside a transaction), so
 * concurrent actions on the same run queue up instead of both acting on a stale state.
 */
async function loadRun(
  db: Exec,
  runId: string,
  opts: { lock?: boolean } = {}
): Promise<Run> {
  if (!isUuid(runId)) throw notFound(`workflow ${runId}`)
  const query = db
    .select({
      run: t.workflowRuns,
      unitId: t.events.unitId,
      partyId: t.events.partyId,
    })
    .from(t.workflowRuns)
    .innerJoin(t.events, eq(t.workflowRuns.eventId, t.events.id))
    .where(eq(t.workflowRuns.id, runId))
  const [row] = opts.lock
    ? await query.for("update", { of: t.workflowRuns })
    : await query
  if (!row) throw notFound(`workflow ${runId}`)
  if (!row.partyId) throw unprocessable(`workflow ${runId} has no resident`)
  return { ...row.run, unitId: row.unitId, partyId: row.partyId }
}

type AuditExtra = { costCents?: number; idempotencyKey?: string }

/**
 * Atomic state change: only succeeds if the run is still in a state that may legally
 * move to `to`. Double clicks and racing webhooks lose here instead of corrupting state.
 */
async function transition(
  tx: Tx,
  runId: string,
  to: State,
  audit: { actor: Actor; details?: Record<string, unknown> } & AuditExtra
): Promise<State> {
  const current = await loadRun(tx, runId, { lock: true })
  const updated = await tx
    .update(t.workflowRuns)
    .set({ state: to, updatedAt: clock() })
    .where(
      and(
        eq(t.workflowRuns.id, runId),
        inArray(t.workflowRuns.state, predecessorsOf(to))
      )
    )
    .returning({ id: t.workflowRuns.id })
  if (updated.length === 0) {
    // Re-read: under concurrency the state we loaded may already be stale.
    const latest = await loadRun(tx, runId)
    throw conflict(`cannot move workflow from "${latest.state}" to "${to}"`, {
      state: latest.state,
      to,
    })
  }
  await tx.insert(t.auditEvents).values({
    workflowRunId: runId,
    type: "state_change",
    actor: audit.actor,
    fromState: current.state,
    toState: to,
    details: audit.details ?? {},
    costEur: centsToEur(audit.costCents ?? 0, 4),
    idempotencyKey: audit.idempotencyKey ?? null,
    occurredAt: clock(),
  })
  return current.state as State
}

async function audit(
  db: Exec,
  runId: string,
  type: string,
  actor: Actor,
  details: Record<string, unknown> = {},
  extra: AuditExtra = {}
) {
  await db.insert(t.auditEvents).values({
    workflowRunId: runId,
    type,
    actor,
    details,
    costEur: centsToEur(extra.costCents ?? 0, 4),
    idempotencyKey: extra.idempotencyKey ?? null,
    occurredAt: clock(),
  })
}

async function addMessage(
  db: Exec,
  runId: string,
  role: "agent" | "tenant" | "system" | "partner",
  content: string,
  senderPartyId: string | null = null
) {
  const [conv] = await db
    .select({ id: t.conversations.id })
    .from(t.conversations)
    .where(eq(t.conversations.workflowRunId, runId))
  if (!conv) throw notFound(`conversation for ${runId}`)
  await db.insert(t.messages).values({
    conversationId: conv.id,
    senderPartyId,
    role,
    content,
    sentAt: clock(),
  })
}

function offerOf(run: RunRow): ComputedOffer {
  if (!run.offer) throw unprocessable("workflow has no offer")
  return run.offer as ComputedOffer
}

const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })

export function offerSentence(o: ComputedOffer): string {
  const base = `${o.product} from ${o.partner_name} for ${formatEur(o.monthly_price_cents)}/month (${o.contract_months} months)`
  if (o.on_time)
    return `${base}, live on ${fmtDay(o.start_date)} – your move-in day.`
  if (o.bridge)
    return `${base}. The line can be live by ${fmtDay(o.start_date)}; until then you get a ${o.bridge.product}, delivered by ${fmtDay(o.bridge.ready_by)}.`
  return `${base}, earliest start ${fmtDay(o.start_date)}.`
}

async function runsOfEvent(db: Exec, eventId: string) {
  const rows = await db
    .select({
      id: t.workflowRuns.id,
      partnerId: t.workflowRuns.partnerId,
      slug: t.partners.slug,
      state: t.workflowRuns.state,
    })
    .from(t.workflowRuns)
    .leftJoin(t.partners, eq(t.workflowRuns.partnerId, t.partners.id))
    .where(eq(t.workflowRuns.eventId, eventId))
    .orderBy(asc(t.partners.slug))
  return rows.map((r) => ({
    id: r.id,
    partner_id: r.partnerId,
    partner_slug: r.slug,
    state: r.state,
  }))
}

// ------------------------------------------------------------------ 1. detect

export type TriggerInput = {
  /** Caller-chosen event id (uuid). Re-sending the same id returns the existing runs. */
  id?: string
  type: string
  unit_id: string
  party_id?: string
  occurred_at?: string
  payload?: Record<string, unknown>
  /** Restrict to these partners (manifest ids). */
  partner_slugs?: string[]
}

export async function triggerEvent(db: DB, input: TriggerInput) {
  if (input.id !== undefined && !isUuid(input.id))
    throw unprocessable("event id must be a uuid")
  const eventId = input.id ?? newId()

  // Idempotent: the same event delivered twice returns the existing runs.
  const [existing] = await db
    .select({ id: t.events.id })
    .from(t.events)
    .where(eq(t.events.id, eventId))
  if (existing)
    return {
      event_id: eventId,
      duplicate: true,
      runs: await runsOfEvent(db, eventId),
    }

  const snapshot = await getUnitSnapshot(db, input.unit_id)
  const partyId = input.party_id ?? snapshot.tenant?.contact_id
  if (!partyId)
    throw unprocessable(`unit ${input.unit_id} has no tenant to contact`)
  if (snapshot.tenant && snapshot.tenant.contact_id !== partyId)
    throw unprocessable("party is not the tenant of this unit")

  const payloadDay = input.payload?.move_in_date
  const targetDay =
    typeof payloadDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payloadDay)
      ? payloadDay
      : snapshot.tenant?.move_in
  if (!targetDay)
    throw unprocessable("no target date (move_in_date) for this event")

  const occurredAt = input.occurred_at ? new Date(input.occurred_at) : clock()
  const referenceDay = toDay(now())

  const partners = (await listPartners(db)).filter(
    (p) =>
      (p.manifest.triggers as readonly string[]).includes(input.type) &&
      (!input.partner_slugs || input.partner_slugs.includes(p.slug))
  )

  try {
    return await db.transaction(async (tx) => {
      await insertEvent(tx, {
        id: eventId,
        type: input.type,
        unitId: input.unit_id,
        partyId,
        occurredAt,
        payload: { ...(input.payload ?? {}), move_in_date: targetDay },
      })

      for (const p of partners) {
        const { offer, ineligible } = computeOffer(
          p,
          snapshot,
          referenceDay,
          targetDay
        )
        const runId = newId()
        const state: State = offer ? "detected" : "no_eligible_offer"
        const contactOn = addDays(
          targetDay,
          -p.manifest.contact_window_days_before
        )
        await tx.insert(t.workflowRuns).values({
          id: runId,
          eventId,
          partnerId: p.partnerId,
          offerId: offer?.db_offer_id ?? null,
          state,
          offer: offer
            ? {
                ...offer,
                contact_on: contactOn < referenceDay ? referenceDay : contactOn,
              }
            : null,
        })
        await tx.insert(t.conversations).values({
          workflowRunId: runId,
          channel: "portal",
          participants: [partyId, p.slug],
        })
        await audit(tx, runId, "proposal", "system", {
          trigger: input.type,
          target_date: targetDay,
          reference_day: referenceDay,
          offer: offer
            ? {
                product: offer.product,
                start_date: offer.start_date,
                on_time: offer.on_time,
                bridge: offer.bridge,
              }
            : null,
          ineligible,
        })
        await addMessage(
          tx,
          runId,
          "system",
          offer
            ? `Move-in on ${fmtDay(targetDay)} detected. Best match: ${offerSentence(offer)}`
            : `Move-in on ${fmtDay(targetDay)} detected, but ${p.manifest.name} has no eligible offer for this address.`
        )
      }
      return {
        event_id: eventId,
        duplicate: false,
        runs: await runsOfEvent(tx, eventId),
      }
    })
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Lost a race against an identical delivery – return what the winner created.
      return {
        event_id: eventId,
        duplicate: true,
        runs: await runsOfEvent(db, eventId),
      }
    }
    throw e
  }
}

// ------------------------------------------------------------------ 2+3. reach the resident

export async function markOfferSent(
  db: DB,
  runId: string,
  opts: {
    channel: Channel
    actor: Actor
    costCents?: number
    externalThreadId?: string
  }
) {
  return db.transaction(async (tx) => {
    const run = await loadRun(tx, runId, { lock: true })
    const offer = offerOf(run)
    await transition(tx, runId, "offer_sent", {
      actor: opts.actor,
      details: { channel: opts.channel },
      costCents: opts.costCents,
    })
    if (opts.externalThreadId) {
      await tx
        .update(t.conversations)
        .set({ externalThreadId: opts.externalThreadId })
        .where(eq(t.conversations.workflowRunId, runId))
    }
    const fields = offer.required_context.map((f) => FIELD_LABELS[f]).join(", ")
    await addMessage(
      tx,
      runId,
      "agent",
      `Hi! Your move-in is coming up. ${offerSentence(offer)} To order it, ${offer.partner_name} needs ${fields}. Tap "Agree & order" or just say yes on the phone.`
    )
  })
}

export async function setConversationThread(
  db: DB,
  runId: string,
  threadId: string | null
) {
  await db
    .update(t.conversations)
    .set({ externalThreadId: threadId })
    .where(eq(t.conversations.workflowRunId, runId))
}

export async function recordCallFailure(db: DB, runId: string, reason: string) {
  await setConversationThread(db, runId, null)
  await audit(db, runId, "error", "system", { action: "voice.call", reason })
  await addMessage(
    db,
    runId,
    "system",
    "We couldn't reach you by phone – the offer is right here instead."
  )
}

/** The voice tool must refer to the call we placed for this run, not just any workflow id. */
export async function voiceThreadMatches(
  db: DB,
  runId: string,
  conversationId: string | undefined
): Promise<boolean> {
  if (!isUuid(runId)) return false
  const [conv] = await db
    .select({ thread: t.conversations.externalThreadId })
    .from(t.conversations)
    .where(eq(t.conversations.workflowRunId, runId))
  if (!conv) return false
  if (conv.thread === "simulated") return true // demo without telephony
  if (!conv.thread || conv.thread === "pending") return false
  return conversationId === conv.thread
}

// ------------------------------------------------------------------ consent + order

async function recordConsentTx(
  tx: Tx,
  run: Run,
  channel: Channel,
  fields: ShareableField[] | undefined,
  partner: RegisteredPartner
) {
  const required = partner.manifest.required_context
  // Consent is only valid for what the tenant was actually shown. If the partner's manifest
  // was re-registered with more fields after the offer went out, don't silently widen it.
  const shown = offerOf(run).required_context
  const notShown = required.filter((f) => !shown.includes(f))
  if (notShown.length) {
    throw conflict(
      `the partner now also needs ${notShown.join(", ")}, which the offer did not show; send the offer again`,
      { not_shown: notShown }
    )
  }
  const shared = fields ?? required
  const missingConsent = required.filter((f) => !shared.includes(f))
  if (missingConsent.length) {
    throw unprocessable(
      `the partner needs consent for: ${missingConsent.join(", ")}`,
      { missing_consent: missingConsent }
    )
  }
  // Never share more than the partner declared it needs.
  const extra = shared.filter((f) => !required.includes(f))
  if (extra.length)
    throw unprocessable(
      `fields not requested by the partner: ${extra.join(", ")}`
    )

  await transition(tx, run.id, "consent_given", {
    actor: "tenant",
    details: { channel, data_shared: shared },
  })
  await tx.insert(t.consents).values({
    partyId: run.partyId,
    partnerId: partner.partnerId,
    workflowRunId: run.id,
    dataShared: shared,
    purpose: partner.manifest.purpose,
    channel,
    givenAt: clock(),
  })
}

async function placeOrderTx(
  tx: Tx,
  run: Run,
  channel: Channel,
  snapshot: UnitSnapshot
) {
  const offer = offerOf(run)
  const [consent] = await tx
    .select()
    .from(t.consents)
    .where(eq(t.consents.workflowRunId, run.id))
    .orderBy(asc(t.consents.givenAt))
  // Consent gate: no consent (or a revoked one) means no data leaves centrix.
  if (!consent || consent.revokedAt)
    throw unprocessable("no valid consent for this workflow")

  const { payload, missing } = buildSharedPayload(
    snapshot,
    consent.dataShared as ShareableField[],
    { move_in_date: offer.target_date }
  )
  if (missing.length) {
    throw unprocessable(
      `centrix is missing data the partner needs: ${missing.join(", ")}`,
      { missing_data: missing }
    )
  }

  await transition(tx, run.id, "ordered", {
    actor: "tenant",
    details: { channel },
  })
  const [order] = await tx
    .insert(t.serviceOrders)
    .values({
      offerId: offer.db_offer_id,
      partnerId: offer.partner_id,
      unitId: run.unitId,
      partyId: run.partyId,
      consentId: consent.id,
      workflowRunId: run.id,
      sharedPayload: {
        ...payload,
        product: offer.product,
        offer_id: offer.offer_id,
        requested_start_date: offer.start_date,
        bridge: offer.bridge?.product ?? null,
      },
      startDate: offer.start_date,
      status: "sent",
    })
    .returning({ id: t.serviceOrders.id })
  await audit(tx, run.id, "execution", "system", {
    action: "order.place",
    order_id: order!.id,
    partner: offer.partner_slug,
    fields_shared: Object.keys(payload),
  })
  await addMessage(
    tx,
    run.id,
    "agent",
    `Done – I've ordered ${offer.product} for you. ${offer.partner_name} will confirm shortly; you'll see every step here.`
  )
  return order!.id
}

/** One-tap accept: consent + order in one transaction (portal button or "yes" on the phone). */
export async function acceptOffer(
  db: DB,
  runId: string,
  opts: { channel: Channel; fields?: ShareableField[] }
) {
  const run0 = await loadRun(db, runId)
  if (!run0.partnerId) throw unprocessable("workflow has no partner")
  const partner = await getPartnerById(db, run0.partnerId)
  if (!partner)
    throw unprocessable("the partner of this workflow is not registered")
  const snapshot = await getUnitSnapshot(db, run0.unitId)

  return db.transaction(async (tx) => {
    // Lock first: a second click waits here, then sees "ordered" and gets the same order back.
    const run = await loadRun(tx, runId, { lock: true })
    if (["ordered", "confirmed", "active", "closed"].includes(run.state)) {
      // Retried tool call / double submit: return the existing order instead of failing.
      const [existing] = await tx
        .select({ id: t.serviceOrders.id })
        .from(t.serviceOrders)
        .where(eq(t.serviceOrders.workflowRunId, runId))
      if (existing) return { order_id: existing.id, already_ordered: true }
    }
    if (run.state === "offer_sent") {
      await recordConsentTx(tx, run, opts.channel, opts.fields, partner)
    } else if (run.state !== "consent_given") {
      throw conflict(`offer can't be accepted in state "${run.state}"`, {
        state: run.state,
      })
    }
    await addMessage(
      tx,
      runId,
      "tenant",
      opts.channel === "voice"
        ? "(on the phone) Yes, please order it."
        : "Agree & order",
      run.partyId
    )
    const orderId = await placeOrderTx(
      tx,
      await loadRun(tx, runId),
      opts.channel,
      snapshot
    )
    return { order_id: orderId, already_ordered: false }
  })
}

/** Tenant withdraws consent: the partner feed hides the data, an unplaced order is stopped. History is kept. */
export async function revokeConsent(
  db: DB,
  runId: string,
  opts: { channel: Channel }
) {
  return db.transaction(async (tx) => {
    const run = await loadRun(tx, runId, { lock: true })
    const [consent] = await tx
      .select()
      .from(t.consents)
      .where(eq(t.consents.workflowRunId, runId))
    if (!consent) throw notFound(`consent for ${runId}`)
    if (consent.revokedAt)
      return { revoked_at: consent.revokedAt, already: true }
    const at = clock()
    await tx
      .update(t.consents)
      .set({ revokedAt: at })
      .where(eq(t.consents.id, consent.id))
    await audit(tx, runId, "consent_revoked", "tenant", {
      channel: opts.channel,
      consent_id: consent.id,
    })
    if (run.state === "consent_given") {
      await transition(tx, runId, "declined", {
        actor: "tenant",
        details: { reason: "consent revoked" },
      })
    }
    await addMessage(
      tx,
      runId,
      "agent",
      "Your consent is withdrawn. The provider can no longer see your details; if a contract is already running, the provider is informed to delete your data after cancellation."
    )
    return { revoked_at: at, already: false }
  })
}

export async function declineOffer(
  db: DB,
  runId: string,
  opts: { channel: Channel; reason?: string }
) {
  return db.transaction(async (tx) => {
    const run = await loadRun(tx, runId, { lock: true })
    await transition(tx, runId, "declined", {
      actor: "tenant",
      details: { channel: opts.channel, reason: opts.reason ?? null },
    })
    await addMessage(
      tx,
      runId,
      "tenant",
      opts.reason ? `No thanks – ${opts.reason}` : "No thanks.",
      run.partyId
    )
    await addMessage(
      tx,
      runId,
      "agent",
      "No problem – nothing was shared with the provider."
    )
  })
}

// ------------------------------------------------------------------ 4. partner reports back

const ORDER_RANK: Record<string, number> = {
  sent: 0,
  accepted: 1,
  scheduled: 2,
  active: 3,
  rejected: 3,
}

export async function applyPartnerStatus(
  db: DB,
  partnerSlug: string,
  update: StatusUpdate
) {
  const partner = await getPartnerBySlug(db, partnerSlug)
  if (!partner) throw notFound(`partner ${partnerSlug}`)
  if (!isUuid(update.order_id)) throw notFound(`order ${update.order_id}`)
  const idempotencyKey = `partner:${partnerSlug}:${update.event_id}`
  try {
    return await db.transaction(async (tx) => {
      // FOR UPDATE serialises concurrent webhooks for the same order (without the lock a
      // slower "scheduled" can overwrite an already-committed "active").
      const [order] = await tx
        .select()
        .from(t.serviceOrders)
        .where(eq(t.serviceOrders.id, update.order_id))
        .for("update")
      // A partner may only touch its own orders – a valid signature from partner A
      // must not move partner B's order. Same answer as "no such order": no oracle.
      if (!order || order.partnerId !== partner.partnerId)
        throw notFound(`order ${update.order_id}`)

      const [seen] = await tx
        .select({ id: t.auditEvents.id })
        .from(t.auditEvents)
        .where(eq(t.auditEvents.idempotencyKey, idempotencyKey))
      if (seen)
        return {
          duplicate: true,
          ignored: false,
          state: (await loadRun(tx, order.workflowRunId)).state,
        }

      const run = await loadRun(tx, order.workflowRunId)
      const offer = offerOf(run)
      if (
        !(
          partner.manifest.status_updates.statuses as readonly string[]
        ).includes(update.status)
      ) {
        throw unprocessable(
          `partner did not declare status "${update.status}" in its manifest`
        )
      }

      // Stale or out-of-order update (e.g. "accepted" after "active"): record it, change nothing.
      const newRank = ORDER_RANK[update.status] ?? 0
      const curRank = ORDER_RANK[order.status] ?? 0
      const isReschedule =
        update.status === "scheduled" && order.status === "scheduled"
      if (newRank < curRank || (newRank === curRank && !isReschedule)) {
        await audit(
          tx,
          run.id,
          "partner_update_ignored",
          "partner",
          { ...update, reason: `order already ${order.status}` },
          { idempotencyKey }
        )
        return { duplicate: false, ignored: true, state: run.state }
      }

      const startDate = update.activation_date ?? order.startDate
      // Write the result back onto the unit: the confirmed order *is* the service contract.
      const contractStatus =
        update.status === "active"
          ? "active"
          : update.status === "rejected"
            ? order.contractStatus
            : "signed"
      await tx
        .update(t.serviceOrders)
        .set({
          status: update.status,
          startDate,
          contractStatus,
          monthlyPriceEur:
            contractStatus != null
              ? centsToEur(offer.monthly_price_cents)
              : order.monthlyPriceEur,
          bridge:
            contractStatus != null && offer.bridge
              ? { product: offer.bridge.product, until: startDate }
              : order.bridge,
          updatedAt: clock(),
        })
        .where(eq(t.serviceOrders.id, order.id))

      const label = offer.category === "energy" ? "supply" : "connection"
      if (update.status === "accepted" || update.status === "scheduled") {
        if (run.state === "ordered") {
          await transition(tx, run.id, "confirmed", {
            actor: "partner",
            details: update,
            idempotencyKey,
          })
        } else {
          await audit(
            tx,
            run.id,
            "partner_update",
            "partner",
            { ...update },
            { idempotencyKey }
          )
        }
        await addMessage(
          tx,
          run.id,
          "partner",
          update.status === "scheduled"
            ? `${offer.partner_name}: activation scheduled for ${fmtDay(startDate)}.${update.note ? ` ${update.note}` : ""}`
            : `${offer.partner_name} confirmed your order. Contract signed, start ${fmtDay(startDate)}.`
        )
      } else if (update.status === "active") {
        await transition(tx, run.id, "active", {
          actor: "partner",
          details: update,
          idempotencyKey,
        })
        await addMessage(
          tx,
          run.id,
          "partner",
          `Your ${label} is live. Contract stored on your flat in centrix.`
        )
        await transition(tx, run.id, "closed", {
          actor: "system",
          details: { reason: "service active, result written to centrix" },
        })
      } else if (update.status === "rejected") {
        await transition(tx, run.id, "rejected", {
          actor: "partner",
          details: update,
          idempotencyKey,
        })
        await addMessage(
          tx,
          run.id,
          "partner",
          `${offer.partner_name} couldn't fulfil the order${update.note ? `: ${update.note}` : "."} Your property manager has been notified.`
        )
      }
      return {
        duplicate: false,
        ignored: false,
        state: (await loadRun(tx, run.id)).state,
      }
    })
  } catch (e) {
    // Two deliveries of the same event raced past the check; the unique key stopped the second.
    if (isUniqueViolation(e))
      return { duplicate: true, ignored: false, state: null }
    throw e
  }
}

// ------------------------------------------------------------------ read models

export async function getRunView(db: DB, runId: string) {
  const run = await loadRun(db, runId)
  const convs = await db
    .select({ id: t.conversations.id })
    .from(t.conversations)
    .where(eq(t.conversations.workflowRunId, runId))
  const [msgs, audits, orders, consentRows, partyRows, partnerRows] =
    await Promise.all([
      convs.length
        ? db
            .select()
            .from(t.messages)
            .where(
              inArray(
                t.messages.conversationId,
                convs.map((c) => c.id)
              )
            )
            .orderBy(asc(t.messages.sentAt), asc(t.messages.id))
        : Promise.resolve([]),
      db
        .select()
        .from(t.auditEvents)
        .where(eq(t.auditEvents.workflowRunId, runId))
        .orderBy(asc(t.auditEvents.occurredAt), asc(t.auditEvents.id)),
      db
        .select()
        .from(t.serviceOrders)
        .where(eq(t.serviceOrders.workflowRunId, runId)),
      db.select().from(t.consents).where(eq(t.consents.workflowRunId, runId)),
      db
        .select({ id: t.parties.id, name: t.parties.name })
        .from(t.parties)
        .where(eq(t.parties.id, run.partyId)),
      run.partnerId
        ? db
            .select({
              id: t.partners.id,
              slug: t.partners.slug,
              name: t.partners.name,
            })
            .from(t.partners)
            .where(eq(t.partners.id, run.partnerId))
        : Promise.resolve([]),
    ])
  const auditView = audits.map((a) => ({
    ...a,
    costCents: eurToCents(a.costEur),
  }))
  const aiCostCents = auditView.reduce((s, a) => s + a.costCents, 0)
  const manualTouches = audits.filter(
    (a) => a.actor === "property_manager"
  ).length
  const baselineMinutes =
    COSTS.manualBaselineContacts * COSTS.manualMinutesPerContact
  return {
    run: {
      ...run,
      state: isState(run.state) ? run.state : ("detected" as State),
      terminal: TERMINAL.has(run.state as State),
    },
    tenant: partyRows[0] ?? null,
    partner: partnerRows[0] ?? null,
    offer: run.offer as (ComputedOffer & { contact_on: string }) | null,
    messages: msgs,
    audit: auditView,
    order: orders[0] ?? null,
    consent: consentRows[0] ?? null,
    metrics: {
      ai_cost_cents: aiCostCents,
      manual_touches: manualTouches,
      automated_messages: msgs.filter(
        (m) => m.role === "agent" || m.role === "system"
      ).length,
      baseline_manual_minutes: baselineMinutes,
      baseline_manual_cost_cents: Math.round(
        (baselineMinutes / 60) * COSTS.managerHourlyCents
      ),
    },
  }
}

export async function listRuns(
  db: DB,
  filter: { partyId?: string; unitId?: string } = {}
) {
  if (
    (filter.partyId && !isUuid(filter.partyId)) ||
    (filter.unitId && !isUuid(filter.unitId))
  )
    return []
  const conds: SQL[] = []
  if (filter.partyId) conds.push(eq(t.events.partyId, filter.partyId))
  if (filter.unitId) conds.push(eq(t.events.unitId, filter.unitId))
  const rows = await db
    .select({
      run: t.workflowRuns,
      unitId: t.events.unitId,
      partyId: t.events.partyId,
      partnerSlug: t.partners.slug,
      partnerName: t.partners.name,
    })
    .from(t.workflowRuns)
    .innerJoin(t.events, eq(t.workflowRuns.eventId, t.events.id))
    .leftJoin(t.partners, eq(t.workflowRuns.partnerId, t.partners.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(t.workflowRuns.createdAt), asc(t.partners.slug))
  return rows.map((r) => ({
    ...r.run,
    unitId: r.unitId,
    partyId: r.partyId,
    partnerSlug: r.partnerSlug,
    partnerName: r.partnerName,
  }))
}

export async function listPartnerOrders(db: DB, partnerSlug?: string) {
  return db
    .select({
      order: t.serviceOrders,
      partnerSlug: t.partners.slug,
      partnerName: t.partners.name,
      product: t.partnerOffers.product,
      consentRevokedAt: t.consents.revokedAt,
    })
    .from(t.serviceOrders)
    .innerJoin(t.partners, eq(t.serviceOrders.partnerId, t.partners.id))
    .innerJoin(t.partnerOffers, eq(t.serviceOrders.offerId, t.partnerOffers.id))
    .innerJoin(t.consents, eq(t.serviceOrders.consentId, t.consents.id))
    .where(partnerSlug ? eq(t.partners.slug, partnerSlug) : undefined)
    .orderBy(asc(t.serviceOrders.createdAt))
}

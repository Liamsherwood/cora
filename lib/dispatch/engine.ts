import { and, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm"

import type { DB, Tx } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { notFound } from "@/lib/errors"
import de from "@/lib/i18n/de"
import en from "@/lib/i18n/en"
import { now } from "@/lib/time"

import {
  CASE_PRIORITY,
  categorize,
  composeMessage,
  planSlot,
  readReply,
  slotLabel,
} from "./plan"
import {
  initialSteps,
  stepOf,
  type DispatchPriority,
  type DispatchStep,
  type DispatchView,
} from "./steps"
import {
  digits,
  dispatchChannel,
  sendDispatchWhatsApp,
  type DispatchChannel,
} from "./whatsapp"

/*
 * Cora's dispatch of a maintenance request: one step per call, each a plain-code
 * decision over centrix data (no model), under a row lock so two tabs advancing the
 * same dispatch run each step once. Only the WhatsApp send leaves the transaction:
 * the step is claimed first ("running"), sent, then settled.
 */

const SIMULATED_REPLY_MS = Number(
  process.env.DISPATCH_SIMULATED_REPLY_MS ?? 3500
)
/** A send still "running" after this long died with its request. */
const STALE_SEND_MS = 60_000

type Row = typeof t.maintenanceDispatches.$inferSelect
type Language = "de" | "en"
type LiveSend = {
  channel: Extract<DispatchChannel, { mode: "live" }>
  text: string
  language: Language
  params: [string, string, string]
}

/** The asset a category concerns, most specific first. */
const SYSTEM_ASSETS: Partial<Record<string, string[]>> = {
  heating: [
    "gas central boiler",
    "gas combi boiler",
    "oil central boiler",
    "pellet central boiler",
    "air-source heat pump",
  ],
  plumbing: ["instantaneous water heater"],
  elevator: ["elevator"],
  access_keys: ["door lock"],
  appliance: ["fitted kitchen"],
}

const toView = (row: Row): DispatchView => ({
  id: row.id,
  requestKey: row.requestKey,
  status: row.status,
  steps: row.steps,
})

async function lockRow(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(t.maintenanceDispatches)
    .where(eq(t.maintenanceDispatches.id, id))
    .for("update")
  if (!row) throw notFound("dispatch")
  return row
}

/** Replaces one step and any row fields in a single write. */
async function settle(
  tx: Tx,
  row: Row,
  step: DispatchStep,
  fields: Partial<typeof t.maintenanceDispatches.$inferInsert> = {}
) {
  const steps = row.steps.map((s) => (s.key === step.key ? step : s))
  await tx
    .update(t.maintenanceDispatches)
    .set({ ...fields, steps, updatedAt: new Date() })
    .where(eq(t.maintenanceDispatches.id, row.id))
}

const done = <S extends DispatchStep>(step: S, detail: S["detail"]): S => ({
  ...step,
  status: "done",
  at: new Date().toISOString(),
  detail,
})

// ------------------------------------------------------------------ start

export async function startDispatch(
  db: DB,
  input: {
    requestKey: string
    propertyId: string
    title: string
    description: string
    priority: DispatchPriority
  }
): Promise<DispatchView> {
  const [property] = await db
    .select({ id: t.properties.id })
    .from(t.properties)
    .where(eq(t.properties.id, input.propertyId))
  if (!property) throw notFound("property")
  // One dispatch per request: a second click returns the first.
  await db
    .insert(t.maintenanceDispatches)
    .values({
      ...input,
      category: categorize(input.requestKey, input.title, input.description),
      status: "working",
      steps: initialSteps(),
    })
    .onConflictDoNothing({ target: t.maintenanceDispatches.requestKey })
  const [row] = await db
    .select()
    .from(t.maintenanceDispatches)
    .where(eq(t.maintenanceDispatches.requestKey, input.requestKey))
  return toView(row!)
}

// ------------------------------------------------------------------ advance

/** Runs the next step, if it can run now, and returns the dispatch. */
export async function advanceDispatch(
  db: DB,
  id: string
): Promise<DispatchView> {
  const send = await db.transaction(async (tx) => {
    const row = await lockRow(tx, id)
    if (row.status === "done" || row.status === "failed") return null
    const step = row.steps.find((s) => s.status !== "done")
    if (!step) return null

    if (step.status === "running") {
      if (Date.now() - row.updatedAt.getTime() > STALE_SEND_MS)
        await settle(
          tx,
          row,
          { ...step, status: "failed", error: "send_failed" },
          { status: "failed" }
        )
      return null
    }

    switch (step.key) {
      case "building":
        return void (await checkBuilding(tx, row, step))
      case "contractor":
        return void (await chooseContractor(tx, row, step))
      case "slot":
        return void (await findSlot(tx, row, step))
      case "message":
        return messageContractor(tx, row, step)
      case "confirmation":
        return void (await simulateReply(tx, row, step))
      case "work_order":
        return void (await bookWorkOrder(tx, row, step))
    }
  })
  if (send) await deliver(db, id, send)
  return getDispatch(db, id)
}

async function checkBuilding(
  tx: Tx,
  row: Row,
  step: Extract<DispatchStep, { key: "building" }>
) {
  const assetTypes = SYSTEM_ASSETS[row.category] ?? []
  const [buildings, assets, previous] = await Promise.all([
    tx
      .select({
        heatingType: t.buildings.heatingType,
        builtYear: t.buildings.buildingYear,
      })
      .from(t.buildings)
      .where(eq(t.buildings.propertyId, row.propertyId))
      .orderBy(t.buildings.id),
    assetTypes.length
      ? tx
          .selectDistinct({ type: t.assets.assetType })
          .from(t.assets)
          .where(
            and(
              eq(t.assets.propertyId, row.propertyId),
              inArray(t.assets.assetType, assetTypes)
            )
          )
      : [],
    tx
      .select({ id: t.cases.id })
      .from(t.cases)
      .where(
        and(
          eq(t.cases.propertyId, row.propertyId),
          eq(t.cases.category, row.category)
        )
      ),
  ])
  // The building record that says the most; a property can have an annex without data.
  const building = buildings.find((b) => b.heatingType) ?? buildings[0]
  const asset = assetTypes.find((type) => assets.some((a) => a.type === type))
  await settle(
    tx,
    row,
    done(step, {
      system:
        (row.category === "heating" ? building?.heatingType : null) ??
        asset ??
        null,
      builtYear: building?.builtYear ?? null,
      previousCases: previous.length,
    })
  )
}

/**
 * The contractor who knows the building best: most jobs of this kind at this property,
 * then most jobs of this kind overall. Only contractors who agreed to WhatsApp.
 */
async function chooseContractor(
  tx: Tx,
  row: Row,
  step: Extract<DispatchStep, { key: "contractor" }>
) {
  const jobs = await tx
    .select({
      id: t.parties.id,
      name: t.parties.name,
      propertyId: t.cases.propertyId,
    })
    .from(t.workOrders)
    .innerJoin(t.cases, eq(t.cases.id, t.workOrders.caseId))
    .innerJoin(t.parties, eq(t.parties.id, t.workOrders.contractorId))
    .where(
      and(
        eq(t.cases.category, row.category),
        eq(t.parties.whatsappOptIn, true),
        isNotNull(t.parties.phone)
      )
    )
  const byContractor = new Map<
    string,
    { id: string; name: string; jobsHere: number; jobsTotal: number }
  >()
  for (const job of jobs) {
    const c = byContractor.get(job.id) ?? {
      id: job.id,
      name: job.name,
      jobsHere: 0,
      jobsTotal: 0,
    }
    c.jobsTotal++
    if (job.propertyId === row.propertyId) c.jobsHere++
    byContractor.set(job.id, c)
  }
  const [best] = [...byContractor.values()].sort(
    (a, b) =>
      b.jobsHere - a.jobsHere ||
      b.jobsTotal - a.jobsTotal ||
      a.name.localeCompare(b.name)
  )
  if (!best) {
    await settle(
      tx,
      row,
      { ...step, status: "failed", error: "no_contractor" },
      { status: "failed" }
    )
    return
  }
  const { id, ...detail } = best
  await settle(tx, row, done(step, detail), { contractorId: id })
}

async function findSlot(
  tx: Tx,
  row: Row,
  step: Extract<DispatchStep, { key: "slot" }>
) {
  const at = now()
  const busy = await tx
    .select({ at: t.workOrders.scheduledAt })
    .from(t.workOrders)
    .where(
      and(
        eq(t.workOrders.contractorId, row.contractorId!),
        gte(t.workOrders.scheduledAt, new Date(at.getTime() - 3 * 3_600_000)),
        ne(t.workOrders.status, "cancelled")
      )
    )
  const slot = planSlot(
    at,
    row.priority,
    busy.flatMap((b) => (b.at ? [b.at] : []))
  )
  await settle(
    tx,
    row,
    done(step, {
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
    }),
    { slotStart: slot.start }
  )
}

async function contractorOf(tx: Tx, row: Row) {
  const [contractor] = await tx
    .select({
      name: t.parties.name,
      phone: t.parties.phone,
      language: t.parties.language,
    })
    .from(t.parties)
    .where(eq(t.parties.id, row.contractorId!))
  return {
    ...contractor!,
    language: (contractor!.language === "en" ? "en" : "de") as Language,
  }
}

function slotOf(row: Row) {
  const slot = stepOf(row.steps, "slot")!.detail!
  return { start: new Date(slot.start), end: new Date(slot.end) }
}

/** The request in the contractor's language; the dashboard's demo requests have both. */
function requestText(row: Row, language: Language) {
  const demo = (language === "de" ? de : en).dashboard.demoRequests
  return row.requestKey in demo
    ? demo[row.requestKey as keyof typeof demo]
    : { title: row.title, description: row.description }
}

async function messageContractor(
  tx: Tx,
  row: Row,
  step: Extract<DispatchStep, { key: "message" }>
): Promise<LiveSend | null> {
  const contractor = await contractorOf(tx, row)
  const [property] = await tx
    .select({ address: t.properties.address })
    .from(t.properties)
    .where(eq(t.properties.id, row.propertyId))
  const slot = slotOf(row)
  const { title, description } = requestText(row, contractor.language)
  const text = composeMessage({
    language: contractor.language,
    priority: row.priority,
    title,
    description,
    address: property!.address,
    slot,
  })
  const channel = dispatchChannel(contractor.phone)

  if (channel.mode === "simulated") {
    await settle(
      tx,
      row,
      done(step, {
        text,
        mode: "simulated",
        sentAt: new Date().toISOString(),
      }),
      { status: "waiting" }
    )
    return null
  }
  // Claim the send; it happens after commit so the lock isn't held while Meta answers.
  await settle(
    tx,
    row,
    { ...step, status: "running", detail: { text, mode: "live" } },
    { contractorPhone: channel.to }
  )
  const { day, from, to } = slotLabel(slot, contractor.language)
  return {
    channel,
    text,
    language: contractor.language,
    params: [title, property!.address, `${day}, ${from}–${to}`],
  }
}

async function deliver(db: DB, id: string, send: LiveSend) {
  let failed = false
  try {
    await sendDispatchWhatsApp(send.channel, send)
  } catch (e) {
    failed = true
    console.error("[dispatch] WhatsApp send failed", (e as Error).message)
  }
  await db.transaction(async (tx) => {
    const row = await lockRow(tx, id)
    const step = stepOf(row.steps, "message")!
    if (step.status !== "running") return
    await settle(
      tx,
      row,
      failed
        ? { ...step, status: "failed", error: "send_failed" }
        : {
            ...step,
            status: "done",
            at: new Date().toISOString(),
            detail: { ...step.detail!, sentAt: new Date().toISOString() },
          },
      { status: failed ? "failed" : "waiting" }
    )
  })
}

function confirmReply(slot: { start: Date; end: Date }, language: Language) {
  const { day, from } = slotLabel(slot, language)
  return language === "de"
    ? `Ja, passt. Ich bin am ${day} um ${from} Uhr da.`
    : `Yes, works for me. I'll be there on ${day} at ${from}.`
}

/** DEMO ONLY – a simulated message gets the contractor's yes a few seconds later. */
async function simulateReply(
  tx: Tx,
  row: Row,
  step: Extract<DispatchStep, { key: "confirmation" }>
) {
  const message = stepOf(row.steps, "message")!.detail!
  if (message.mode !== "simulated") return
  if (Date.now() - new Date(message.sentAt!).getTime() < SIMULATED_REPLY_MS)
    return
  const { language } = await contractorOf(tx, row)
  await settle(
    tx,
    row,
    done(step, { reply: confirmReply(slotOf(row), language), accepted: true }),
    { status: "working" }
  )
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Writes the result back to centrix: a case on the property and its work order. */
async function bookWorkOrder(
  tx: Tx,
  row: Row,
  step: Extract<DispatchStep, { key: "work_order" }>
) {
  const [[property], past] = await Promise.all([
    tx
      .select({ isWeg: t.properties.isWeg })
      .from(t.properties)
      .where(eq(t.properties.id, row.propertyId)),
    tx
      .select({ cost: t.workOrders.costEstimateEur })
      .from(t.workOrders)
      .innerJoin(t.cases, eq(t.cases.id, t.workOrders.caseId))
      .where(
        and(
          eq(t.workOrders.contractorId, row.contractorId!),
          eq(t.cases.category, row.category),
          isNotNull(t.workOrders.costEstimateEur)
        )
      ),
  ])
  const estimate = median(past.map((p) => Number(p.cost)))
  const costEstimateEur = estimate === null ? null : estimate.toFixed(2)
  const payer = property!.isWeg ? "weg" : "owner"
  const [kase] = await tx
    .insert(t.cases)
    .values({
      propertyId: row.propertyId,
      category: row.category,
      priority: CASE_PRIORITY[row.priority],
      status: "scheduled",
    })
    .returning({ id: t.cases.id })
  const [order] = await tx
    .insert(t.workOrders)
    .values({
      caseId: kase!.id,
      contractorId: row.contractorId!,
      scheduledAt: row.slotStart,
      costEstimateEur,
      payer,
      status: "scheduled",
    })
    .returning({ id: t.workOrders.id })
  await settle(tx, row, done(step, { costEstimateEur, payer }), {
    status: "done",
    caseId: kase!.id,
    workOrderId: order!.id,
  })
}

// ------------------------------------------------------------------ contractor replies

/**
 * A WhatsApp message from a number Cora is waiting on. Returns Cora's answer, or null
 * when no dispatch waits on that number (the message is then a resident's).
 */
export async function handleContractorReply(
  db: DB,
  phone: string,
  text: string
): Promise<string | null> {
  const outcome = await db.transaction(async (tx) => {
    const [waiting] = await tx
      .select({ id: t.maintenanceDispatches.id })
      .from(t.maintenanceDispatches)
      .where(
        and(
          eq(t.maintenanceDispatches.status, "waiting"),
          eq(t.maintenanceDispatches.contractorPhone, digits(phone))
        )
      )
      .orderBy(desc(t.maintenanceDispatches.updatedAt))
      .limit(1)
    if (!waiting) return null
    const row = await lockRow(tx, waiting.id)
    if (row.status !== "waiting") return null
    const { language } = await contractorOf(tx, row)
    const accepted = readReply(text)
    if (accepted === null) return { row, language, accepted }
    const step = stepOf(row.steps, "confirmation")!
    const reply = text.trim().slice(0, 500)
    await settle(
      tx,
      row,
      accepted
        ? done(step, { reply, accepted })
        : {
            ...step,
            status: "failed",
            at: new Date().toISOString(),
            detail: { reply, accepted },
            error: "declined",
          },
      { status: accepted ? "working" : "failed" }
    )
    return { row, language, accepted }
  })
  if (!outcome) return null
  const { row, language, accepted } = outcome
  if (accepted) await advanceDispatch(db, row.id)
  const german = language === "de"
  if (accepted === null)
    return german
      ? "Bitte antworten Sie mit Ja oder Nein."
      : "Please reply yes or no."
  if (!accepted)
    return german
      ? "Danke für die Rückmeldung. Die Hausverwaltung meldet sich."
      : "Thanks for letting us know. The property manager will be in touch."
  const { day, from, to } = slotLabel(slotOf(row), language)
  return german
    ? `Danke! Der Termin ist gebucht: ${day}, ${from}–${to} Uhr.`
    : `Thanks! The appointment is booked: ${day}, ${from}–${to}.`
}

// ------------------------------------------------------------------ read

export async function getDispatch(db: DB, id: string): Promise<DispatchView> {
  const [row] = await db
    .select()
    .from(t.maintenanceDispatches)
    .where(eq(t.maintenanceDispatches.id, id))
  if (!row) throw notFound("dispatch")
  return toView(row)
}

export async function listDispatches(db: DB): Promise<DispatchView[]> {
  const rows = await db
    .select()
    .from(t.maintenanceDispatches)
    .orderBy(desc(t.maintenanceDispatches.createdAt))
    .limit(100)
  return rows.map(toView)
}

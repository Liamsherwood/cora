import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import type { DB } from "@/lib/db"
import * as t from "@/lib/db/schema"
import { newId } from "@/lib/ids"
import { readSeedFile, resetDemoData } from "@/lib/seed"
import { acceptOffer, markOfferSent, triggerEvent } from "@/lib/workflow/engine"

import { closeDb, LENA, resetDb, UNIT_4B } from "./helpers"

let db: DB
beforeEach(async () => {
  db = await resetDb()
})
afterAll(closeDb)

describe("demo reset", () => {
  it("clears the demo's workflows and keeps everything else", async () => {
    // Demo activity on a seed unit, up to a placed order.
    const demoEventId = newId()
    const ev = await triggerEvent(db, {
      id: demoEventId,
      type: "tenant.move_in",
      unit_id: UNIT_4B,
      party_id: LENA,
      payload: { move_in_date: "2026-12-01" },
    })
    const run = ev.runs.find((r) => r.partner_slug === "example_fibre")!
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" })
    await acceptOffer(db, run.id, { channel: "portal" })

    // Data that is not part of the seed: another property with an event on its unit.
    const propertyId = newId()
    const buildingId = newId()
    const unitId = newId()
    const otherEventId = newId()
    await db.insert(t.properties).values({
      id: propertyId,
      address: "Elsewhere 1, 10115 Berlin",
      isWeg: false,
    })
    await db.insert(t.buildings).values({ id: buildingId, propertyId })
    await db
      .insert(t.units)
      .values({ id: unitId, buildingId, propertyId, identifier: "X1" })
    await db.insert(t.events).values({
      id: otherEventId,
      type: "case.created",
      unitId,
      occurredAt: new Date(),
    })
    // A seed row changed by hand is restored.
    await db
      .update(t.parties)
      .set({ name: "Changed" })
      .where(eq(t.parties.id, LENA))

    await resetDemoData(db)

    const seed = await readSeedFile()
    const seedUnits = seed.units.map((u) => u.id)
    // The demo's events are gone; what is left on seed units is the seeded history.
    const eventIds = (
      await db
        .select({ id: t.events.id })
        .from(t.events)
        .where(inArray(t.events.unitId, seedUnits))
    ).map((e) => e.id)
    expect(eventIds).not.toContain(demoEventId)
    expect(eventIds.sort()).toEqual(seed.events.map((e) => e.id).sort())
    expect(await db.select().from(t.workflowRuns)).toEqual([])
    expect(await db.select().from(t.serviceOrders)).toEqual([])
    expect(await db.select().from(t.consents)).toEqual([])
    expect(await db.select().from(t.messages)).toEqual([])

    const [other] = await db
      .select()
      .from(t.events)
      .where(eq(t.events.id, otherEventId))
    expect(other).toBeDefined()
    const [lena] = await db
      .select()
      .from(t.parties)
      .where(eq(t.parties.id, LENA))
    expect(lena!.name).toBe("Lena Hoffmann")
    expect(await db.select().from(t.partners)).toHaveLength(2)
    expect(await db.select().from(t.properties)).toHaveLength(
      seed.properties.length + 1
    )
  })

  it("is idempotent", async () => {
    await resetDemoData(db)
    await resetDemoData(db)
    const seed = await readSeedFile()
    expect(await db.select().from(t.units)).toHaveLength(seed.units.length)
  })
})

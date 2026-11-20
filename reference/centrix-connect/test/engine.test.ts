import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { freshDb } from "./helpers";
import { acceptOffer, applyPartnerStatus, declineOffer, getRunView, listPartnerOrders, markOfferSent, revokeConsent, triggerEvent } from "@/workflow/engine";
import { AppError } from "@/lib/errors";

beforeAll(() => {
  process.env.DEMO_NOW = "2026-11-20T09:14:00Z";
});

let db: DB;
beforeEach(async () => {
  db = await freshDb();
});

const moveIn = (id = "evt_test_1") =>
  triggerEvent(db, { id, type: "tenant.move_in", unit_id: "unit_4b", party_id: "c_202", payload: { move_in_date: "2026-12-01" } });

async function expectAppError(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);
}

describe("move-in -> internet, end to end", () => {
  it("runs from event to contract on the unit", async () => {
    const ev = await moveIn();
    expect(ev.runs.map((r) => r.partner_id).sort()).toEqual(["example_fibre", "stadtwerk_energy"]);
    const run = ev.runs.find((r) => r.partner_id === "example_fibre")!;
    expect(run.state).toBe("detected");

    await markOfferSent(db, run.id, { channel: "voice", actor: "ai", costCents: 30 });
    const { order_id } = await acceptOffer(db, run.id, { channel: "voice" });

    const [order] = await db.select().from(t.serviceOrders).where(eq(t.serviceOrders.id, order_id));
    expect(Object.keys(order!.sharedPayload).sort()).toEqual(
      ["address", "bridge", "email", "move_in_date", "name", "offer_id", "product", "requested_start_date"].sort(),
    );
    expect(JSON.stringify(order!.sharedPayload)).not.toContain("Maria"); // owner never shared

    await applyPartnerStatus(db, "example_fibre", { order_id, status: "accepted", event_id: "pevt_00001", occurred_at: "2026-11-20T10:00:00Z" });
    const [contract1] = await db.select().from(t.serviceContracts).where(eq(t.serviceContracts.unitId, "unit_4b"));
    expect(contract1?.status).toBe("signed");
    expect(contract1?.consent.channel).toBe("voice");

    const r = await applyPartnerStatus(db, "example_fibre", { order_id, status: "active", event_id: "pevt_00002", occurred_at: "2026-12-04T08:00:00Z", activation_date: "2026-12-04" });
    expect(r.state).toBe("closed");
    const [contract2] = await db.select().from(t.serviceContracts).where(eq(t.serviceContracts.unitId, "unit_4b"));
    expect(contract2?.status).toBe("active");
    expect(contract2?.startDate).toBe("2026-12-04");

    const view = await getRunView(db, run.id);
    expect(view.metrics.manual_touches).toBe(0);
    expect(view.metrics.ai_cost_cents).toBe(30);
    expect(view.audit.filter((a) => a.type === "state_change").map((a) => a.toState)).toEqual([
      "offer_sent", "consent_given", "ordered", "confirmed", "active", "closed",
    ]);
  });
});

describe("idempotency and guards", () => {
  it("same event twice does not create a second flow", async () => {
    const a = await moveIn("evt_dup_1");
    const b = await moveIn("evt_dup_1");
    expect(b.duplicate).toBe(true);
    expect(b.runs.map((r) => r.id).sort()).toEqual(a.runs.map((r) => r.id).sort());
  });

  it("cannot accept before the offer was sent; a retried accept returns the same order", async () => {
    const run = (await moveIn()).runs.find((r) => r.partner_id === "example_fibre")!;
    await expectAppError(acceptOffer(db, run.id, { channel: "portal" }), 409);
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" });
    const first = await acceptOffer(db, run.id, { channel: "portal" });
    const again = await acceptOffer(db, run.id, { channel: "voice" });
    expect(again).toEqual({ order_id: first.order_id, already_ordered: true });
    const orders = await db.select().from(t.serviceOrders).where(eq(t.serviceOrders.workflowRunId, run.id));
    expect(orders).toHaveLength(1);
  });

  it("concurrent double click creates exactly one order", async () => {
    const run = (await moveIn()).runs.find((r) => r.partner_id === "example_fibre")!;
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" });
    await Promise.allSettled([acceptOffer(db, run.id, { channel: "portal" }), acceptOffer(db, run.id, { channel: "portal" })]);
    const orders = await db.select().from(t.serviceOrders).where(eq(t.serviceOrders.workflowRunId, run.id));
    expect(orders).toHaveLength(1);
  });

  it("refuses partial consent", async () => {
    const run = (await moveIn()).runs.find((r) => r.partner_id === "example_fibre")!;
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" });
    await expectAppError(acceptOffer(db, run.id, { channel: "portal", fields: ["name"] }), 422);
    await expectAppError(acceptOffer(db, run.id, { channel: "portal", fields: ["name", "address", "move_in_date", "email", "phone"] }), 422);
  });

  it("decline shares nothing", async () => {
    const run = (await moveIn()).runs.find((r) => r.partner_id === "example_fibre")!;
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" });
    await declineOffer(db, run.id, { channel: "portal" });
    expect(await db.select().from(t.serviceOrders)).toHaveLength(0);
    expect(await db.select().from(t.consents)).toHaveLength(0);
  });

  it("partner webhooks: duplicates, foreign orders and stale updates", async () => {
    const run = (await moveIn()).runs.find((r) => r.partner_id === "example_fibre")!;
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" });
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" });

    // another partner can't move this order
    await expectAppError(applyPartnerStatus(db, "stadtwerk_energy", { order_id, status: "active", event_id: "pevt_x0001", occurred_at: "2026-11-20T10:00:00Z" }), 404);

    const upd = { order_id, status: "active" as const, event_id: "pevt_a0001", occurred_at: "2026-11-21T10:00:00Z" };
    await applyPartnerStatus(db, "example_fibre", upd);
    const dup = await applyPartnerStatus(db, "example_fibre", upd);
    expect(dup.duplicate).toBe(true);

    const stale = await applyPartnerStatus(db, "example_fibre", { order_id, status: "accepted", event_id: "pevt_a0002", occurred_at: "2026-11-20T11:00:00Z" });
    expect(stale.ignored).toBe(true);
    expect((await getRunView(db, run.id)).run.state).toBe("closed");
  });

  it("partner can't send a status it did not declare", async () => {
    const run = (await moveIn()).runs.find((r) => r.partner_id === "stadtwerk_energy")!;
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" });
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" });
    await expectAppError(applyPartnerStatus(db, "stadtwerk_energy", { order_id, status: "scheduled", event_id: "pevt_s0001", occurred_at: "2026-11-20T10:00:00Z" }), 422);
  });

  it("unknown unit -> 404-ish error, tenant mismatch -> 422", async () => {
    await expect(triggerEvent(db, { type: "tenant.move_in", unit_id: "nope" })).rejects.toThrow();
    await expectAppError(triggerEvent(db, { type: "tenant.move_in", unit_id: "unit_4b", party_id: "c_203" }), 422);
  });

  it("revoking consent redacts the partner feed", async () => {
    const run = (await moveIn()).runs.find((r) => r.partner_id === "example_fibre")!;
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" });
    await acceptOffer(db, run.id, { channel: "portal" });
    await revokeConsent(db, run.id, { channel: "portal" });
    const rows = await listPartnerOrders(db, "example_fibre");
    expect(rows[0]?.consentRevokedAt).toBeTruthy();
  });

  it("partner gets the move-in date from the event, not stale master data", async () => {
    const ev = await triggerEvent(db, { id: "evt_date_1", type: "tenant.move_in", unit_id: "unit_4b", party_id: "c_202", payload: { move_in_date: "2026-12-15" } });
    const run = ev.runs.find((r) => r.partner_id === "example_fibre")!;
    await markOfferSent(db, run.id, { channel: "portal", actor: "system" });
    const { order_id } = await acceptOffer(db, run.id, { channel: "portal" });
    const [order] = await db.select().from(t.serviceOrders).where(eq(t.serviceOrders.id, order_id));
    expect(order!.sharedPayload.move_in_date).toBe("2026-12-15");
  });
});

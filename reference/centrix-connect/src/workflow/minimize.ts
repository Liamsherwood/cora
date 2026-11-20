import type { ShareableField } from "@/connectors/spec";
import type { UnitSnapshot } from "@/centrix/repository";

/**
 * Builds the payload a partner receives: ONLY the consented fields, nothing else.
 * Owner data, rent, other tenants and internal ids never leave centrix.
 */
export function buildSharedPayload(
  snapshot: UnitSnapshot,
  fields: readonly ShareableField[],
  /** Values from the triggering event that take precedence over master data (e.g. the event's move-in date). */
  overrides: Partial<Record<ShareableField, unknown>> = {},
): { payload: Record<string, unknown>; missing: ShareableField[] } {
  const t = snapshot.tenant;
  const values: Record<ShareableField, unknown> = {
    name: t?.name ?? null,
    email: t?.email ?? null,
    phone: t?.phone ?? null,
    address: {
      street: snapshot.property.street,
      postcode: snapshot.property.postcode,
      city: snapshot.property.city,
      unit: snapshot.unit.identifier,
    },
    move_in_date: t?.move_in ?? null,
    floor: snapshot.unit.floor,
    unit_size_sqm: snapshot.unit.size_sqm,
    meter_number: snapshot.unit.meters.find((m) => m.type === "electricity")?.number ?? null,
    ...overrides,
  };
  const payload: Record<string, unknown> = {};
  const missing: ShareableField[] = [];
  for (const f of new Set(fields)) {
    const v = values[f];
    if (v == null || v === "") missing.push(f);
    else payload[f] = v;
  }
  return { payload, missing };
}

export const FIELD_LABELS: Record<ShareableField, string> = {
  name: "your name",
  email: "your email",
  phone: "your phone number",
  address: "your new address",
  move_in_date: "your move-in date",
  floor: "the floor",
  unit_size_sqm: "the flat size",
  meter_number: "your electricity meter number",
};

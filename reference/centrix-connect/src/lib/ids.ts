import { randomBytes } from "node:crypto";

let last = 0;
let seq = 0;

/**
 * Time-ordered ids (prefix_<ms base36><seq><random>). Sorting by id = creation order, which keeps
 * timelines stable even when two rows share a timestamp.
 */
export function newId(prefix: string): string {
  const ms = Date.now();
  seq = ms === last ? seq + 1 : 0;
  last = ms;
  return `${prefix}_${ms.toString(36).padStart(9, "0")}${seq.toString(36).padStart(3, "0")}${randomBytes(4).toString("hex")}`;
}

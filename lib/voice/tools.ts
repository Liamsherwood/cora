import { z } from "zod"

import { ticketClassification } from "@/lib/tickets/classification"
import { optionalText, requiredText } from "@/lib/tickets/details"

/** Agents often send "" or null for an optional argument they have no value for. */
const blank = (value: unknown) =>
  value === "" || value === null ? undefined : value

/**
 * Arguments of the `file_maintenance_ticket` server tool (see scripts/sync-voice-agent.ts).
 *
 * Free text is tidied and clipped rather than rejected: a 400 here means the resident
 * hears "I couldn't file your report". Unknown keys are dropped, not refused, so a tool
 * schema synced ahead of a deployment (or behind it) never loses a report either. The
 * identifiers stay strict: party and unit must come from verified call context.
 */
export const fileTicketInput = z.object({
  party_id: z.uuid(),
  /** Defaults to the caller's main home. */
  unit_id: z.preprocess(blank, z.uuid().optional()),
  ...ticketClassification.shape,
  /** "common" for stairwell, lift, basement, courtyard, roof, front door. */
  scope: z.preprocess(blank, ticketClassification.shape.scope.default("unit")),
  /** Short English inbox title. Optional so an agent on an older tool schema still files. */
  title: optionalText(120),
  /** One or two English sentences for the property manager. */
  summary: requiredText(400),
  /** What the caller said, in their words and language. */
  description: requiredText(1000),
  location: optionalText(160),
  since: optionalText(120),
  resident_actions: optionalText(300),
  safety_advice: optionalText(300),
  access: optionalText(200),
  /** {{system__conversation_id}}, to find the recording later. */
  conversation_id: z.preprocess(blank, z.string().max(100).optional()),
})

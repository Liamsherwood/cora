import { z } from "zod"

/**
 * What a ticket records beyond its classification: a short title for the inbox and the
 * facts staff need to act without calling the resident back. Agents supply these as
 * free text; everything is tidied and clipped here, never rejected, so a long answer
 * can't cost the resident their report mid-call.
 */

export const TITLE_MAX = 60

/** Collapses whitespace and clips to `max` characters on a word boundary. */
export function clipText(raw: string, max: number): string {
  const text = raw.replace(/\s+/g, " ").trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space >= max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?–-]+$/u, "")}…`
}

/** "  „kitchen tap leaking.“ " -> "Kitchen tap leaking"; blank -> null. */
export function ticketTitle(raw: string | null | undefined): string | null {
  const text = (raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”„‚‘’«»]+|[\s"'“”„‚‘’«».,;:!?]+$/gu, "")
  if (!text) return null
  return clipText(text[0]!.toUpperCase() + text.slice(1), TITLE_MAX)
}

/** Optional agent text: null, blank or missing -> undefined; otherwise tidied and clipped. */
export const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((text) => (text ? clipText(text, max) || undefined : undefined))

/** Required agent text, tidied and clipped instead of rejected when too long. */
export const requiredText = (max: number) =>
  z
    .string()
    .transform((text) => clipText(text, max))
    .pipe(z.string().min(3))

export const ticketDetails = z.object({
  /** The resident's own account, in their language. */
  description: z.string().optional(),
  /** Where exactly: room, floor, appliance. */
  location: z.string().optional(),
  /** When it started or how long it has been going on. */
  since: z.string().optional(),
  /** What the resident already did, e.g. shut off the water. */
  residentActions: z.string().optional(),
  /** Safety advice Cora gave during the conversation. */
  safetyAdvice: z.string().optional(),
  /** When someone can be let in. Never access codes. */
  access: z.string().optional(),
  /** The resident's language, so the callback is in it too. */
  language: z.string().optional(),
})

export type TicketDetails = z.infer<typeof ticketDetails>

/** Drops empty values so a follow-up never blanks a fact recorded earlier. */
export function mergeDetails(
  current: TicketDetails | null | undefined,
  update: TicketDetails | null | undefined
): TicketDetails | null {
  const result: TicketDetails = {}
  for (const key of Object.keys(
    ticketDetails.shape
  ) as (keyof TicketDetails)[]) {
    const value = update?.[key] || current?.[key]
    if (value) result[key] = value
  }
  return Object.keys(result).length ? result : null
}

/*
 * The one message Cora may send on WhatsApp before the tenant has written: Meta only
 * delivers business-initiated messages from a template it approved. So the template is a
 * short, neutral opener. Once the tenant replies, the 24-hour service window is open and
 * the Cora agent holds the conversation in free text (lib/whatsapp/offer-agent.ts).
 *
 * `npm run whatsapp:template` submits these bodies to Meta; the sender fills the same
 * parameters, and renderOpener() records the exact text in the workflow conversation.
 */

export const DEFAULT_TEMPLATE_NAME = "cora_move_in_offer"

export type TemplateLanguage = "de" | "en"

/** Body text per language. {{1}} first name · {{2}} move-in date · {{3}} address · {{4}} service. */
export const OPENER_BODY: Record<TemplateLanguage, string> = {
  de: "Hallo {{1}}, hier ist Cora, die digitale Assistentin von reltix. Für Ihren Einzug am {{2}} in {{3}} habe ich ein {{4}}-Angebot für Sie. Antworten Sie einfach auf diese Nachricht, dann erkläre ich Ihnen alles.",
  en: "Hi {{1}}, this is Cora, the digital assistant from reltix. For your move-in on {{2}} at {{3}} I have an {{4}} offer for you. Just reply to this message and I'll walk you through it.",
}

/** Example values Meta asks for when reviewing the template. */
export const OPENER_EXAMPLE: Record<TemplateLanguage, string[]> = {
  de: ["Liam", "1. Dezember 2026", "Musterstraße 12, 52062 Aachen", "Internet"],
  en: ["Liam", "1 December 2026", "Musterstraße 12, 52062 Aachen", "internet"],
}

const SERVICE: Record<TemplateLanguage, Record<string, string>> = {
  de: { internet: "Internet", energy: "Strom" },
  en: { internet: "internet", energy: "electricity" },
}

export function templateLanguage(language: string | null | undefined) {
  return (language === "en" ? "en" : "de") satisfies TemplateLanguage
}

/** The four body parameters, in template order. */
export function openerParams(input: {
  language: TemplateLanguage
  firstName: string
  moveIn: string
  address: string
  category: string
}): string[] {
  const date = new Intl.DateTimeFormat(
    input.language === "de" ? "de-DE" : "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
  ).format(new Date(`${input.moveIn}T12:00:00Z`))
  return [
    input.firstName,
    date,
    input.address,
    SERVICE[input.language][input.category] ??
      SERVICE[input.language].internet!,
  ]
}

export function renderOpener(language: TemplateLanguage, params: string[]) {
  return OPENER_BODY[language].replace(
    /\{\{(\d)\}\}/g,
    (token, n: string) => params[Number(n) - 1] ?? token
  )
}

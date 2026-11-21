/**
 * First sentence of an inbound call, in the caller's language. The agent says it is an
 * AI straight away (EU AI Act Art. 50) and names the property manager.
 */
const KNOWN: Record<string, (name: string) => string> = {
  de: (n) =>
    `Hallo ${n}, hier ist Cora, die KI-Assistentin Ihrer Hausverwaltung. Wie kann ich Ihnen helfen?`,
  en: (n) =>
    `Hi ${n}, this is Cora, the AI assistant of your property management. How can I help?`,
  tr: (n) =>
    `Merhaba ${n}, ben Cora, mülk yönetiminizin yapay zekâ asistanıyım. Size nasıl yardımcı olabilirim?`,
  pl: (n) =>
    `Dzień dobry, ${n}. Tu Cora, asystentka AI zarządcy nieruchomości. W czym mogę pomóc?`,
  uk: (n) =>
    `Вітаю, ${n}! Це Cora, ШІ-асистентка вашої керуючої компанії. Чим можу допомогти?`,
  ar: (n) =>
    `مرحباً ${n}، أنا كورا، المساعدة الذكية لإدارة العقار. كيف يمكنني مساعدتك؟`,
  nl: (n) =>
    `Hallo ${n}, met Cora, de AI-assistent van uw vastgoedbeheerder. Waarmee kan ik u helpen?`,
}

const UNKNOWN =
  "Hallo, hier ist Cora, die KI-Assistentin der Hausverwaltung. Hello, this is Cora, the AI assistant of your property management. Wie kann ich helfen? How can I help?"

export function greeting(language: string, firstName: string | null): string {
  if (!firstName) return UNKNOWN
  return (KNOWN[language] ?? KNOWN.en!)(firstName)
}

/** Opening line of the outbound move-in offer call (and the portal widget). */
export function moveInGreeting(
  language: string,
  firstName: string,
  moveInDate: string
): string {
  const d = new Date(`${moveInDate}T12:00:00Z`)
  if (language === "de") {
    const day = new Intl.DateTimeFormat("de-DE", {
      day: "numeric",
      month: "long",
      timeZone: "Europe/Berlin",
    }).format(d)
    return `Hallo ${firstName}, hier ist Cora, die KI-Assistentin Ihrer Hausverwaltung. Ich rufe wegen Ihres Einzugs am ${day} an. Haben Sie kurz eine Minute?`
  }
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(d)
  return `Hi ${firstName}, this is Cora, the AI assistant of your property management. I'm calling about your move-in on ${day}. Do you have a minute?`
}

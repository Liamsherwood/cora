export const localeSettings = {
  en: { label: "English", intlLocale: "en-IE" },
  de: { label: "Deutsch", intlLocale: "de-DE" },
} as const

export type Locale = keyof typeof localeSettings
export const locales = Object.keys(localeSettings) as Locale[]
export const defaultLocale = "en" satisfies Locale

export function isLocale(value: string): value is Locale {
  return Object.hasOwn(localeSettings, value)
}

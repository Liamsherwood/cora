import "server-only"

import type en from "./en"
import type { Locale } from "./locales"

export type Messages = typeof en

const dictionaries = {
  en: () => import("./en").then((module) => module.default),
  de: () => import("./de").then((module) => module.default),
} satisfies Record<Locale, () => Promise<Messages>>

export function getMessages(locale: Locale) {
  return dictionaries[locale]()
}

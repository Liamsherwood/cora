import assert from "node:assert/strict"
import test from "node:test"

import { defaultLocale, locales, localeSettings } from "./locales.ts"

const loadCatalog = async (locale) => (await import(`./${locale}.ts`)).default

const placeholders = (message) =>
  new Set(Array.from(message.matchAll(/\{(\w+)\}/g), ([, name]) => name))

function compareMessages(reference, translation, path) {
  assert.deepEqual(
    Object.keys(translation).sort(),
    Object.keys(reference).sort(),
    path
  )

  for (const [key, message] of Object.entries(reference)) {
    const translated = translation[key]
    const label = `${path}.${key}`
    if (typeof message === "string") {
      assert.ok(typeof translated === "string" && translated.trim(), label)
      assert.deepEqual(placeholders(translated), placeholders(message), label)
    } else {
      compareMessages(message, translated, label)
    }
  }
}

const reference = await loadCatalog(defaultLocale)

for (const locale of locales) {
  test(`${locale} catalog has matching keys and placeholders`, async () => {
    compareMessages(reference, await loadCatalog(locale), locale)
  })

  test(`${locale} declares a supported Intl locale`, () => {
    const { intlLocale } = localeSettings[locale]
    assert.deepEqual(Intl.NumberFormat.supportedLocalesOf(intlLocale), [
      intlLocale,
    ])
  })
}

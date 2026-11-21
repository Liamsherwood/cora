import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getMessages } from "@/lib/i18n/dictionaries"
import { isLocale, localeSettings, locales } from "@/lib/i18n/locales"

const privacyEmail = "liam@thesherwoods.de"

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { privacy } = await getMessages(locale)
  return { title: `${privacy.title} · Cora`, description: privacy.intro }
}

export default async function PrivacyPage({
  params,
}: PageProps<"/[locale]/privacy">) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { privacy } = await getMessages(locale)

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-10 sm:py-14">
      <nav className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border pb-5 text-sm">
        <Link href={`/${locale}`} className="font-medium hover:underline">
          Cora
        </Link>
        <div className="flex gap-4">
          {locales.map((language) => (
            <Link
              key={language}
              href={`/${language}/privacy`}
              hrefLang={language}
              lang={language}
              aria-current={language === locale ? "page" : undefined}
              className="text-muted-foreground hover:text-foreground hover:underline aria-[current=page]:text-foreground"
            >
              {localeSettings[language].label}
            </Link>
          ))}
        </div>
      </nav>

      <article className="mt-8 sm:mt-10">
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
          {privacy.title}
        </h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {privacy.intro}
        </p>
        <div className="mt-9 space-y-7">
          <section className="rounded-(--radius-card) border border-border bg-card p-5 sm:p-6">
            <h2 className="text-xl font-medium">{privacy.contact.title}</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              {privacy.contact.description}{" "}
              <a
                href={`mailto:${privacyEmail}`}
                className="text-foreground underline underline-offset-4"
              >
                {privacyEmail}
              </a>
              .
            </p>
          </section>
          {Object.entries(privacy.sections).map(([id, section]) => (
            <section key={id} aria-labelledby={id}>
              <h2 id={id} className="text-xl font-medium">
                {section.title}
              </h2>
              <div className="mt-2 space-y-3 leading-relaxed text-muted-foreground">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="mt-9 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-sm">
          <a
            className="underline underline-offset-4"
            href="https://www.whatsapp.com/legal/privacy-policy-eea"
          >
            {privacy.whatsappLink}
          </a>
          <a
            className="underline underline-offset-4"
            href="https://vercel.com/legal/dpa"
          >
            {privacy.vercelLink}
          </a>
          <a
            className="underline underline-offset-4"
            href="https://supabase.com/legal/customer-resources/data-processing-addendum"
          >
            {privacy.supabaseLink}
          </a>
          <a
            className="underline underline-offset-4"
            href="https://www.edpb.europa.eu/contact/file-a-complaint_en"
          >
            {privacy.authorityLink}
          </a>
        </footer>
      </article>
    </main>
  )
}

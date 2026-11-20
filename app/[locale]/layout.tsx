import type { Metadata } from "next"
import localFont from "next/font/local"
import { notFound } from "next/navigation"
import { SpeedInsights } from "@vercel/speed-insights/next"

import { ThemeProvider } from "@/components/theme-provider"
import { getMessages } from "@/lib/i18n/dictionaries"
import { isLocale, locales } from "@/lib/i18n/locales"
import "../globals.css"

const montreal = localFont({
  src: [
    { path: "../fonts/pp-neue-montreal-regular.woff2", weight: "400" },
    { path: "../fonts/pp-neue-montreal-medium.woff2", weight: "500" },
  ],
  display: "swap",
  variable: "--font-montreal",
})

export const dynamicParams = false

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { metadata } = await getMessages(locale)
  return metadata
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  return (
    <html lang={locale} className={montreal.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        {process.env.VERCEL_URL && <SpeedInsights />}
      </body>
    </html>
  )
}

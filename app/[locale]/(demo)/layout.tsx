import type { Metadata } from "next"
import Link from "next/link"

import { DEMO_TENANT_ID } from "@/lib/demo"

export const metadata: Metadata = {
  title: "Partner Connect · Cora",
  description:
    "Plug a partner into centrix: move-in to internet, with zero forms.",
}

const NAV = [
  { path: "", label: "Dashboard" },
  { path: "/services", label: "Directory (property manager)" },
  { path: `/portal/${DEMO_TENANT_ID}`, label: "Tenant portal (Lena)" },
  { path: "/partner", label: "Partner dashboard" },
]

/** The demo screens live under the locale root layout; links keep the current locale. */
export default async function DemoLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params
  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-background">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <span className="font-semibold">Partner Connect</span>
          {NAV.map((n) => (
            <Link
              key={n.path}
              href={`/${locale}${n.path}`}
              className="text-muted-foreground hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}

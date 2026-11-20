import type { Metadata } from "next"
import Link from "next/link"

import { DEMO_TENANT_ID } from "@/lib/demo"

export const metadata: Metadata = {
  title: "centrix · Partner Connect",
  description:
    "Plug a partner into centrix: move-in to internet, with zero forms.",
}

const NAV = [
  { href: "/centrix", label: "centrix (property manager)" },
  { href: `/portal/${DEMO_TENANT_ID}`, label: "Tenant portal (Lena)" },
  { href: "/partner", label: "Partner dashboard" },
]

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-background">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <span className="font-semibold">centrix · Partner Connect</span>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
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

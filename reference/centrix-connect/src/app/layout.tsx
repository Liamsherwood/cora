import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "centrix · Partner Connect", description: "Plug a partner into centrix" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-line bg-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
            <span className="font-semibold text-brand">centrix · Partner Connect</span>
            <Link className="text-muted hover:text-ink" href="/centrix">centrix (property manager)</Link>
            <Link className="text-muted hover:text-ink" href="/portal/c_202">Tenant portal</Link>
            <Link className="text-muted hover:text-ink" href="/partner">Partner dashboard</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

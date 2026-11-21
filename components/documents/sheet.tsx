import type { ReactNode } from "react"

import { ISSUER } from "@/lib/centrix/documents"
import { cn } from "@/lib/utils"

/**
 * Building blocks of a printed document. The sheet is paper: white with dark ink in
 * both themes, A4 width on screen and full width when printed.
 */

export function Sheet({ children }: { children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white px-6 py-8 text-[13px] leading-relaxed text-neutral-900 shadow-panel [print-color-adjust:exact] sm:px-14 sm:py-14 print:max-w-none print:p-0 print:shadow-none">
      {children}
      <footer className="mt-12 border-t border-neutral-200 pt-3 text-[11px] text-neutral-500">
        {ISSUER.name} · {ISSUER.street} · {ISSUER.postcode} {ISSUER.city} ·{" "}
        {ISSUER.phone} · {ISSUER.email}
      </footer>
    </article>
  )
}

/** Issuer on the left; file reference and date line on the right. */
export function Letterhead({
  reference,
  dateLine,
}: {
  reference: string
  dateLine?: string
}) {
  return (
    <header className="mb-10 flex flex-wrap items-start justify-between gap-x-8 gap-y-3 border-b border-neutral-200 pb-5">
      <div>
        <p className="text-base font-medium tracking-tight">{ISSUER.name}</p>
        <p className="text-xs text-neutral-500">
          {ISSUER.street}, {ISSUER.postcode} {ISSUER.city}
        </p>
      </div>
      <div className="text-xs text-neutral-500 sm:text-right">
        <p className="tabular-nums">{reference}</p>
        {dateLine && <p>{dateLine}</p>}
      </div>
    </header>
  )
}

export function Title({
  children,
  subtitle,
}: {
  children: ReactNode
  subtitle?: ReactNode
}) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-medium tracking-tight text-balance">
        {children}
      </h1>
      {subtitle && <p className="mt-1 text-neutral-500">{subtitle}</p>}
    </div>
  )
}

export function Section({
  title,
  children,
}: {
  title?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-6 break-inside-avoid">
      {title && <h2 className="mb-1.5 font-medium">{title}</h2>}
      <div className="space-y-2">{children}</div>
    </section>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-pretty">{children}</p>
}

/** Label/value rows, stacked on narrow screens. */
export function Facts({
  rows,
}: {
  rows: [label: ReactNode, value: ReactNode][]
}) {
  return (
    <dl className="border-t border-neutral-200">
      {rows.map(([label, value], i) => (
        <div
          key={i}
          className="grid gap-x-6 border-b border-neutral-200 py-1.5 sm:grid-cols-[13rem_minmax(0,1fr)]"
        >
          <dt className="text-neutral-500">{label}</dt>
          <dd className="wrap-break-word">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A table; empty string cells print as blank lines to fill in by hand. */
export function Table({
  head,
  rows,
  className,
}: {
  head: ReactNode[]
  rows: ReactNode[][]
  className?: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-left", className)}>
        <thead>
          <tr className="border-b border-neutral-300 text-neutral-500">
            {head.map((h, i) => (
              <th key={i} scope="col" className="py-1.5 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-neutral-200">
              {row.map((cell, j) => (
                <td key={j} className="h-9 py-1.5 pr-4 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Signature lines, two per row (e.g. place and date | signature). A `value` is printed
 * on the line, as when the place and date are already filled in.
 */
export function Signatures({
  lines,
}: {
  lines: { label: string; value?: string }[]
}) {
  return (
    <div className="mt-12 grid break-inside-avoid grid-cols-2 gap-x-10 gap-y-10">
      {lines.map((line, i) => (
        <div key={i} className="flex flex-col justify-end">
          <p className="min-h-5">{line.value}</p>
          <p className="mt-1 border-t border-neutral-400 pt-1.5 text-xs text-neutral-500">
            {line.label}
          </p>
        </div>
      ))}
    </div>
  )
}

/** A filled checkbox line, as on official forms. */
export function Checked({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2">
      <span
        aria-hidden
        className="mt-1 flex size-3.5 shrink-0 items-center justify-center border border-neutral-500 text-[10px] leading-none"
      >
        ✕
      </span>
      <span>{children}</span>
    </p>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 border-l-2 border-neutral-300 pl-3 text-xs text-neutral-500">
      {children}
    </p>
  )
}

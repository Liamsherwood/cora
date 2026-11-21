import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Form from "next/form"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import type { Messages } from "@/lib/i18n/dictionaries"
import { cn } from "@/lib/utils"

export type DirectoryMessages = Messages["directory"]

export const DIRECTORY_TABS = [
  "units",
  "people",
  "partners",
  "workflows",
] as const
export type DirectoryTab = (typeof DIRECTORY_TABS)[number]

export function isDirectoryTab(value: unknown): value is DirectoryTab {
  return DIRECTORY_TABS.some((tab) => tab === value)
}

/** Builds a directory URL; empty values are left out. */
export function directoryHref(
  locale: string,
  params: Record<string, string | number | null | undefined>
) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params))
    if (value != null && value !== "" && !(key === "page" && value === 1))
      query.set(key, String(value))
  const qs = query.toString()
  return `/${locale}/services${qs ? `?${qs}` : ""}`
}

/** A bordered workspace panel with an optional header, like the dashboard's sections. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** No body padding: for lists and tables that run edge to edge. */
  flush?: boolean
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-(--radius-card) border border-border bg-card shadow-panel",
        className
      )}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-medium tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {action && (
            <div className="flex flex-wrap items-center gap-2">{action}</div>
          )}
        </div>
      )}
      <div className={cn(!flush && "px-5 py-4 sm:px-6", bodyClassName)}>
        {children}
      </div>
    </section>
  )
}

/** Heading for a group inside a panel. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-sm font-medium">{children}</h3>
}

export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm wrap-break-word">{value}</dd>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>
}

/** The section switcher: link chips with counts, styled like the request filters. */
export function DirectoryTabs({
  locale,
  current,
  counts,
  messages,
  formatNumber,
}: {
  locale: string
  current: DirectoryTab
  counts: Record<DirectoryTab, number>
  messages: DirectoryMessages
  formatNumber: (n: number) => string
}) {
  return (
    <nav aria-label={messages.sections} className="mb-5 flex flex-wrap gap-1.5">
      {DIRECTORY_TABS.map((tab) => (
        <Link
          key={tab}
          href={directoryHref(locale, { tab: tab === "units" ? null : tab })}
          aria-current={tab === current ? "page" : undefined}
          className={cn(
            buttonVariants({
              variant: tab === current ? "secondary" : "ghost",
            }),
            "rounded-(--radius-chip)"
          )}
        >
          <span className="flex items-baseline gap-1.5">
            {messages.tabs[tab]}
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {formatNumber(counts[tab])}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  )
}

const field =
  "min-w-0 flex-1 rounded-(--radius-field) border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"

/** GET search form; navigates client-side and keeps the current tab. */
export function SearchForm({
  locale,
  tab,
  q,
  placeholder,
  messages,
}: {
  locale: string
  tab: DirectoryTab
  q: string
  placeholder: string
  messages: DirectoryMessages
}) {
  return (
    <Form
      action={`/${locale}/services`}
      className="flex w-full items-center gap-2"
      role="search"
    >
      {tab !== "units" && <input type="hidden" name="tab" value={tab} />}
      <input
        type="search"
        name="q"
        defaultValue={q}
        aria-label={placeholder}
        placeholder={`${placeholder}…`}
        maxLength={100}
        className={field}
      />
      <Button
        type="submit"
        variant="outline"
        size="icon"
        aria-label={messages.search}
        title={messages.search}
        className="shrink-0"
      >
        <HugeiconsIcon icon={Search01Icon} />
      </Button>
      {q && (
        <Link
          href={directoryHref(locale, { tab: tab === "units" ? null : tab })}
          className={buttonVariants({ variant: "ghost" })}
        >
          {messages.clearSearch}
        </Link>
      )}
    </Form>
  )
}

/** Previous / next links for a paged list fetched with one extra row. */
export function Pager({
  page,
  hasNext,
  href,
  messages,
}: {
  page: number
  hasNext: boolean
  href: (page: number) => string
  messages: DirectoryMessages
}) {
  if (page === 1 && !hasNext) return null
  return (
    <nav
      aria-label={messages.pagination}
      className="flex justify-between gap-3 border-t border-border px-5 py-3 text-sm sm:px-6"
    >
      {page > 1 ? (
        <Link href={href(page - 1)} className="hover:underline">
          ← {messages.previous}
        </Link>
      ) : (
        <span />
      )}
      {hasNext && (
        <Link href={href(page + 1)} className="hover:underline">
          {messages.next} →
        </Link>
      )}
    </nav>
  )
}

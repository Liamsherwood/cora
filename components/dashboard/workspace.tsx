"use client"

import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Database01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode, Ref } from "react"

import { CoraAvatar } from "@/components/tickets/cora-avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { locales, localeSettings } from "@/lib/i18n/locales"
import { cn } from "@/lib/utils"

import { AppearanceSwitcher } from "./appearance-switcher"
import { useDashboardLocale } from "./locale"
import type { RentPeriod } from "./rent-history"
import { UserMenu } from "./user-menu"
import { views, type Section, type View } from "./views"

export type { Section, View }

/**
 * Dashboard views switch in place when the dashboard is mounted (`onView`); from any
 * other workspace page they link back to the dashboard at that view.
 */
type ViewNavigation = { current: Section; onView?: (view: View) => void }

const portfolioItems = [
  ...views,
  { id: "services", icon: Database01Icon },
] as const

function viewHref(locale: string, view: View) {
  return view === "overview" ? `/${locale}` : `/${locale}?view=${view}`
}

/** The logo: switches to the overview in place, or links home from other pages. */
function BrandButton({ onView }: { onView?: (view: View) => void }) {
  const { locale, messages } = useDashboardLocale()
  return onView ? (
    <button
      type="button"
      className="rounded-md"
      aria-label={messages.centrixOverview}
      onClick={() => onView("overview")}
    >
      <Brand />
    </button>
  ) : (
    <Link
      href={`/${locale}`}
      className="inline-block rounded-md"
      aria-label={messages.centrixOverview}
    >
      <Brand />
    </Link>
  )
}

function Brand() {
  return (
    <span className="inline-flex min-h-8 items-center text-[25px] leading-none font-medium tracking-[-0.06em]">
      Centrix
    </span>
  )
}

function Navigation({ current, onView }: ViewNavigation) {
  const { locale, messages } = useDashboardLocale()
  const itemClass = "h-10 w-full justify-start gap-2.5 rounded-md px-3"
  const itemState = (id: Section) =>
    id === current
      ? "bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground"
      : "text-muted-foreground"
  return (
    <nav aria-label={messages.workspace} className="px-3.5">
      {/* A full navigation lets the browser answer the inbox's Basic auth challenge. */}
      <a
        href={`/${locale}/tickets`}
        aria-current={current === "tickets" ? "page" : undefined}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          itemClass,
          itemState("tickets"),
          "gap-2"
        )}
      >
        <CoraAvatar size={20} />
        {messages.nav.tickets}
      </a>
      <hr className="mx-3 mt-2 mb-3 border-border" />
      <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">
        {messages.portfolio}
      </p>
      <div className="space-y-1">
        {portfolioItems.map(({ id, icon }) => {
          const className = cn(itemClass, itemState(id))
          const ariaCurrent = id === current ? "page" : undefined
          const content = (
            <>
              <HugeiconsIcon
                icon={icon}
                className="size-[17px]"
                aria-hidden="true"
              />
              {messages.nav[id]}
            </>
          )
          return id !== "services" && onView ? (
            <Button
              key={id}
              variant="ghost"
              aria-current={ariaCurrent}
              onClick={() => onView(id)}
              className={className}
            >
              {content}
            </Button>
          ) : (
            <Link
              key={id}
              href={
                id === "services" ? `/${locale}/services` : viewHref(locale, id)
              }
              aria-current={ariaCurrent}
              className={cn(buttonVariants({ variant: "ghost" }), className)}
            >
              {content}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function WorkspaceNavigationMenu({ current, onView }: ViewNavigation) {
  const { locale, messages } = useDashboardLocale()
  return (
    <nav
      aria-label={messages.workspace}
      className="px-4 pb-2 sm:px-8 md:hidden"
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={<Button variant="ghost" />}
          className="-ml-2 h-11 max-w-full rounded-md px-2"
        >
          <span className="sr-only">{messages.workspaceMenu}</span>
          {messages.nav[current]}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className="size-3.5 text-muted-foreground"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLinkItem
            href={`/${locale}/tickets`}
            className={cn(
              "min-h-11 gap-1",
              current === "tickets" && "bg-muted font-medium"
            )}
            aria-current={current === "tickets" ? "page" : undefined}
          >
            <CoraAvatar size={20} />
            {messages.nav.tickets}
          </DropdownMenuLinkItem>
          <DropdownMenuSeparator className="mx-2.5 my-1 h-px bg-border" />
          {portfolioItems.map(({ id, icon }) => {
            const ariaCurrent = id === current ? "page" : undefined
            const className = cn(
              "min-h-11",
              ariaCurrent && "bg-muted font-medium"
            )
            const content = (
              <>
                <HugeiconsIcon icon={icon} aria-hidden="true" />
                {messages.nav[id]}
              </>
            )

            if (id !== "services" && onView) {
              return (
                <DropdownMenuItem
                  key={id}
                  onClick={() => onView(id)}
                  className={className}
                  aria-current={ariaCurrent}
                >
                  {content}
                </DropdownMenuItem>
              )
            }

            const href =
              id === "services" ? `/${locale}/services` : viewHref(locale, id)
            return (
              <DropdownMenuLinkItem
                key={id}
                href={href}
                render={<Link href={href} />}
                className={className}
                aria-current={ariaCurrent}
              >
                {content}
              </DropdownMenuLinkItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}

export function Sidebar({ current, onView }: ViewNavigation) {
  return (
    <aside className="sticky top-0 hidden h-svh w-[218px] shrink-0 flex-col border-r border-border bg-sidebar md:flex xl:w-[224px]">
      <div className="px-6 pt-6 pb-7">
        <BrandButton onView={onView} />
      </div>
      <Navigation current={current} onView={onView} />
      <div className="mt-auto border-t border-border px-3.5 py-3.5">
        <UserMenu />
      </div>
    </aside>
  )
}

export function WorkspaceHeader({
  current,
  onView,
  onSearch,
}: ViewNavigation & {
  onSearch?: () => void
}) {
  const { locale, messages } = useDashboardLocale()
  const pathname = usePathname()
  const routeSuffix = pathname.slice(locale.length + 1)
  return (
    <header className="border-b border-border bg-card">
      <div className="flex min-h-[65px] items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-8">
        <div className="md:hidden">
          <BrandButton onView={onView} />
        </div>
        <div
          className="hidden items-center gap-2.5 text-sm md:flex"
          aria-label={messages.currentWorkspaceView}
        >
          <span className="text-muted-foreground">{messages.workspace}</span>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={13}
            className="text-muted-foreground"
          />
          <span className="font-medium">{messages.nav[current]}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2.5">
          {onSearch && (
            <Button
              variant="outline"
              onClick={onSearch}
              aria-label={messages.searchWorkspace}
              aria-keyshortcuts="Meta+k Control+k"
              className="size-9 gap-2 px-0 text-muted-foreground lg:w-60 lg:justify-start lg:px-3"
            >
              <HugeiconsIcon icon={Search01Icon} />
              <span className="hidden truncate lg:inline">
                {messages.searchWorkspace}
              </span>
              <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] leading-none lg:inline">
                ⌘ K
              </kbd>
            </Button>
          )}
          {locales
            .filter((target) => target !== locale)
            .map((target) => (
              <Link
                key={target}
                href={`/${target}${routeSuffix}`}
                lang={target}
                hrefLang={target}
                prefetch={false}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "px-2 sm:px-3"
                )}
              >
                {localeSettings[target].label}
              </Link>
            ))}
          {/* The sidebar (with the user menu) is hidden below md. */}
          <div className="md:hidden">
            <UserMenu compact />
          </div>
        </div>
      </div>
      <WorkspaceNavigationMenu current={current} onView={onView} />
    </header>
  )
}

/**
 * The workspace page skeleton shared by the dashboard and the server-rendered workspace
 * pages: sidebar, header, page heading with its actions, content and footer.
 */
export function WorkspaceShell({
  current,
  onView,
  onSearch,
  title,
  headingLeading,
  headingRef,
  description,
  actions,
  children,
}: ViewNavigation & {
  onSearch?: () => void
  title: ReactNode
  headingLeading?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const { locale, messages } = useDashboardLocale()
  return (
    <div className="flex min-h-svh">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {messages.skipToContent}
      </a>
      <Sidebar current={current} onView={onView} />
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader
          current={current}
          onView={onView}
          onSearch={onSearch}
        />
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1460px] px-4 pt-7 pb-10 sm:px-8 sm:pt-9"
        >
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-7">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              {headingLeading}
              <div className="min-w-0">
                <h1
                  ref={headingRef}
                  tabIndex={headingRef ? -1 : undefined}
                  className="text-[30px] leading-[1.1] font-medium tracking-[-0.045em] focus:outline-none sm:text-[38px]"
                >
                  {title}
                </h1>
                {description && (
                  <p className="mt-2 text-sm leading-5 text-muted-foreground sm:text-[15px]">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {actions && (
              <div className="flex flex-wrap items-center gap-2.5">
                {actions}
              </div>
            )}
          </div>
          {children}
        </main>
        <footer
          id="workspace-footer"
          className="mx-auto mt-auto flex w-full max-w-[1460px] items-center gap-3 px-4 pb-6 text-sm text-muted-foreground sm:px-8"
        >
          <Link
            href={`/${locale}/privacy`}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {messages.privacyPolicy}
          </Link>
          <AppearanceSwitcher />
        </footer>
      </div>
    </div>
  )
}

export function MonthPicker({
  month,
  rentHistory,
  onMonth,
}: {
  month: number
  rentHistory: RentPeriod[]
  onMonth: (month: number) => void
}) {
  const { messages } = useDashboardLocale()
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={<Button variant="outline" />}
        className="h-11 sm:h-9"
      >
        <span className="sr-only">{messages.reportingMonth}</span>
        <HugeiconsIcon
          icon={Calendar03Icon}
          className="text-muted-foreground"
        />
        {rentHistory[month].shortMonthYear}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className="size-3.5 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          value={String(month)}
          onValueChange={(value) => onMonth(Number(value))}
        >
          {rentHistory.slice(-3).map(({ month, longMonthYear }, index) => (
            <DropdownMenuRadioItem
              key={month}
              value={String(rentHistory.length - 3 + index)}
            >
              {longMonthYear}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

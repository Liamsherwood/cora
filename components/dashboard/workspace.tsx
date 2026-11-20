import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Building03Icon,
  Calendar03Icon,
  DashboardSquare01Icon,
  Money03Icon,
  Notification01Icon,
  PlugSocketIcon,
  Search01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { locales, localeSettings } from "@/lib/i18n/locales"
import { cn } from "@/lib/utils"

import { AppearanceMenu } from "./appearance-menu"
import { formatMessage, useDashboardLocale } from "./locale"
import type { RentPeriod } from "./rent-history"

const views = [
  { id: "overview", icon: DashboardSquare01Icon },
  { id: "properties", icon: Building03Icon },
  { id: "maintenance", icon: Wrench01Icon },
  { id: "rent", icon: Money03Icon },
] as const

export type View = (typeof views)[number]["id"]

function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-[9px] bg-accent text-accent-foreground"
      >
        <span className="grid -rotate-12 grid-cols-2 gap-[2px]">
          <span className="size-1.5 rounded-tl-full rounded-br-full bg-current" />
          <span className="size-1.5 rounded-tr-full rounded-bl-full bg-current" />
          <span className="size-1.5 rounded-tr-full rounded-bl-full bg-current" />
          <span className="size-1.5 rounded-tl-full rounded-br-full bg-current" />
        </span>
      </span>
      <span className="text-[25px] leading-none font-medium tracking-[-0.06em]">
        cora<span className="text-primary">.</span>
      </span>
    </span>
  )
}

function Navigation({
  view,
  onView,
  mobile = false,
}: {
  view: View
  onView: (view: View) => void
  mobile?: boolean
}) {
  const { locale, messages } = useDashboardLocale()
  const itemClass = mobile
    ? "h-auto min-h-11 w-full flex-col gap-1 px-1 py-1.5 text-center text-[11px] whitespace-normal"
    : "h-10 w-full justify-start gap-2.5 px-3"
  return (
    <nav
      aria-label={messages.workspace}
      className={
        mobile
          ? "grid grid-cols-5 gap-0.5 border-t border-border px-2 py-2 md:hidden"
          : "space-y-1"
      }
    >
      {views.map(({ id, icon }) => (
        <Button
          key={id}
          variant="ghost"
          aria-current={id === view ? "page" : undefined}
          onClick={() => onView(id)}
          className={cn(
            itemClass,
            id === view
              ? "bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground"
              : "text-muted-foreground"
          )}
        >
          <HugeiconsIcon
            icon={icon}
            className={mobile ? "size-4" : "size-[17px]"}
          />
          {messages.nav[id]}
        </Button>
      ))}
      {/* Partner services (move-in → internet etc.): its own server-rendered page. */}
      <Link
        href={`/${locale}/services`}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          itemClass,
          "text-muted-foreground"
        )}
      >
        <HugeiconsIcon
          icon={PlugSocketIcon}
          className={mobile ? "size-4" : "size-[17px]"}
        />
        {messages.nav.services}
      </Link>
    </nav>
  )
}

export function Sidebar({
  view,
  onView,
}: {
  view: View
  onView: (view: View) => void
}) {
  const { messages } = useDashboardLocale()
  return (
    <aside className="sticky top-0 hidden h-svh w-[218px] shrink-0 flex-col border-r border-border bg-sidebar md:flex xl:w-[224px]">
      <div className="px-6 pt-6 pb-9">
        <button
          type="button"
          className="rounded-md"
          aria-label={messages.coraOverview}
          onClick={() => onView("overview")}
        >
          <Brand />
        </button>
      </div>
      <div className="px-3.5">
        <p className="mb-2.5 px-3 text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
          {messages.portfolio}
        </p>
        <Navigation view={view} onView={onView} />
      </div>
      <div className="mt-auto flex items-center gap-2.5 border-t border-border px-[22px] py-[22px]">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-medium text-accent-foreground"
        >
          LM
        </span>
        <div>
          <p className="text-[13px] leading-4 font-medium">Lena Müller</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {messages.demoWorkspace}
          </p>
        </div>
      </div>
    </aside>
  )
}

export function WorkspaceHeader({
  view,
  onView,
  onSearch,
  onAttention,
  attentionCount,
}: {
  view: View
  onView: (view: View) => void
  onSearch: () => void
  onAttention: () => void
  attentionCount: number
}) {
  const { locale, messages, format } = useDashboardLocale()
  const pathname = usePathname()
  const routeSuffix = pathname.slice(locale.length + 1)
  return (
    <header className="border-b border-border bg-card">
      <div className="flex min-h-[65px] items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-8">
        <div className="md:hidden">
          <button
            type="button"
            className="rounded-md"
            aria-label={messages.coraOverview}
            onClick={() => onView("overview")}
          >
            <Brand />
          </button>
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
          <span className="font-medium">{messages.nav[view]}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2.5">
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
          <Button
            variant="outline"
            size="icon"
            className="relative text-muted-foreground"
            aria-label={formatMessage(messages.attentionCount, {
              count: format.number(attentionCount),
            })}
            onClick={onAttention}
          >
            <HugeiconsIcon icon={Notification01Icon} />
            {attentionCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-[7px] size-1.5 rounded-full bg-destructive ring-2 ring-card"
              />
            )}
          </Button>
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
          <AppearanceMenu />
        </div>
      </div>
      <Navigation view={view} onView={onView} mobile />
    </header>
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
        render={<Button variant="outline" size="lg" />}
        aria-label={messages.reportingMonth}
      >
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

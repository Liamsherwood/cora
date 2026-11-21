"use client"

import { RefreshIcon, UnfoldMoreIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useState, useTransition } from "react"

import { resetDemoAction } from "@/app/[locale]/(demo)/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { demoRequests } from "./data"
import { useDashboardLocale } from "./locale"
import { updateRequests } from "./request-store"

type ResetStatus = "pending" | "done" | "error" | null

/**
 * Resets the whole demo: the partner workflows on the server (needs DEMO_MODE) and the
 * maintenance requests this browser has changed.
 */
function useDemoReset() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<"done" | "error" | null>(null)

  // The confirmation stands in for the subtitle briefly, then gives it back.
  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => setResult(null), 4000)
    return () => clearTimeout(timer)
  }, [result])

  function reset() {
    setResult(null)
    startTransition(async () => {
      updateRequests(() => [...demoRequests])
      const { error } = await resetDemoAction()
      setResult(error ? "error" : "done")
    })
  }

  const status: ResetStatus = pending ? "pending" : result
  return { status, reset }
}

function Avatar({ busy }: { busy?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-medium text-accent-foreground transition-opacity duration-200",
        busy && "opacity-50"
      )}
    >
      LM
    </span>
  )
}

/** The signed-in user: opens the workspace menu (currently just the demo reset). */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { messages } = useDashboardLocale()
  const { status, reset } = useDemoReset()
  const statusText =
    status === "pending"
      ? messages.resettingDemo
      : status === "done"
        ? messages.demoResetDone
        : status === "error"
          ? messages.demoResetFailed
          : null

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label={messages.workspaceMenu}
          className={cn(
            "flex items-center rounded-md text-left outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-muted",
            compact ? "p-0.5" : "w-full gap-2.5 px-2 py-2"
          )}
        >
          <Avatar busy={status === "pending"} />
          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-4 font-medium">
                  Lena Müller
                </span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-xs text-muted-foreground",
                    status === "error" && "text-destructive"
                  )}
                >
                  {statusText ?? messages.demoWorkspace}
                </span>
              </span>
              <HugeiconsIcon
                icon={UnfoldMoreIcon}
                size={16}
                className="shrink-0 text-muted-foreground"
              />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={compact ? "bottom" : "top"}
          align={compact ? "end" : "start"}
        >
          <DropdownMenuItem onClick={reset} disabled={status === "pending"}>
            <HugeiconsIcon icon={RefreshIcon} />
            {messages.resetDemo}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" className="sr-only">
        {statusText}
      </span>
    </>
  )
}

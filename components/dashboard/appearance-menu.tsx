"use client"

import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useDashboardLocale } from "./locale"

const appearanceOptions = [
  { value: "light", icon: Sun01Icon },
  { value: "dark", icon: Moon02Icon },
  { value: "system", icon: ComputerIcon },
] as const

export function AppearanceMenu() {
  const { theme, setTheme } = useTheme()
  const { messages } = useDashboardLocale()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon" />}
        aria-label={messages.appearance}
        title={messages.appearance}
        className="size-10 text-muted-foreground xl:w-auto xl:gap-2 xl:px-3"
      >
        <HugeiconsIcon icon={Sun01Icon} aria-hidden className="dark:hidden" />
        <HugeiconsIcon
          icon={Moon02Icon}
          aria-hidden
          className="hidden dark:block"
        />
        <span className="hidden xl:inline">{messages.appearance}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup
          aria-label={messages.workspaceAppearance}
          value={theme ?? "system"}
          onValueChange={setTheme}
        >
          {appearanceOptions.map(({ value, icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <span className="flex min-h-7 items-center gap-2">
                <HugeiconsIcon icon={icon} size={16} aria-hidden />
                {messages[value]}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

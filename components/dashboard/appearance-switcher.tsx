"use client"

import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

import { useDashboardLocale } from "./locale"

const appearanceOptions = [
  { value: "system", icon: ComputerIcon },
  { value: "light", icon: Sun01Icon },
  { value: "dark", icon: Moon02Icon },
] as const

const subscribe = () => () => {}

export function AppearanceSwitcher() {
  const { theme, setTheme } = useTheme()
  const { messages } = useDashboardLocale()
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )

  return (
    <RadioGroup
      aria-label={messages.workspaceAppearance}
      value={hydrated ? (theme ?? "system") : ""}
      onValueChange={setTheme}
      className="inline-flex shrink-0 rounded-full bg-secondary p-0.75"
    >
      {appearanceOptions.map(({ value, icon }) => (
        <Radio.Root
          key={value}
          value={value}
          render={<button type="button" />}
          nativeButton
          data-slot="button"
          aria-label={messages[value]}
          title={messages[value]}
          className="grid h-7.5 w-9 place-items-center rounded-full text-muted-foreground hover:text-foreground data-checked:bg-foreground/12 data-checked:text-foreground"
        >
          <HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} aria-hidden />
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}

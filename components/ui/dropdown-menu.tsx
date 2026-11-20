"use client"

import { Menu } from "@base-ui/react/menu"

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuRadioGroup = Menu.RadioGroup

export function DropdownMenuContent({
  children,
  align = "end",
  side = "bottom",
}: {
  children: React.ReactNode
  align?: Menu.Positioner.Props["align"]
  side?: Menu.Positioner.Props["side"]
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        align={align}
        side={side}
        sideOffset={6}
        className="z-50"
      >
        <Menu.Popup
          data-slot="dropdown-menu-content"
          className="min-w-36 origin-(--transform-origin) rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-float outline-none"
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

export function DropdownMenuRadioItem({
  children,
  ...props
}: Menu.RadioItem.Props) {
  return (
    <Menu.RadioItem
      closeOnClick
      {...props}
      className="flex cursor-pointer items-center justify-between gap-4 rounded-md px-2.5 py-1.5 outline-none data-highlighted:bg-accent"
    >
      {children}
      <Menu.RadioItemIndicator className="size-1.5 rounded-full bg-ring" />
    </Menu.RadioItem>
  )
}

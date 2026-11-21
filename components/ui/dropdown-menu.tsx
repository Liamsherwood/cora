"use client"

import { Menu } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

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
          className="min-w-36 origin-(--transform-origin) rounded-(--radius-overlay) border border-border bg-popover p-1 text-sm text-popover-foreground shadow-float transition-[opacity,transform] duration-150 ease-out outline-none data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0 motion-reduce:transition-opacity motion-reduce:data-starting-style:scale-100"
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
      className="flex cursor-pointer items-center justify-between gap-4 rounded-sm px-2.5 py-1.5 outline-none data-highlighted:bg-accent"
    >
      {children}
      <Menu.RadioItemIndicator className="size-1.5 rounded-full bg-ring" />
    </Menu.RadioItem>
  )
}

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 outline-none data-highlighted:bg-accent data-disabled:cursor-default data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"

export function DropdownMenuItem({ className, ...props }: Menu.Item.Props) {
  return (
    <Menu.Item
      {...props}
      className={(state) =>
        cn(
          itemClass,
          typeof className === "function" ? className(state) : className
        )
      }
    />
  )
}

export function DropdownMenuLinkItem({
  className,
  ...props
}: Menu.LinkItem.Props) {
  return (
    <Menu.LinkItem
      closeOnClick
      {...props}
      className={(state) =>
        cn(
          itemClass,
          typeof className === "function" ? className(state) : className
        )
      }
    />
  )
}

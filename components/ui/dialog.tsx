"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const Dialog = DialogPrimitive.Root
export const DialogClose = DialogPrimitive.Close
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

export function DialogContent({
  children,
  closeLabel,
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Popup> & {
  closeLabel: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-foreground/25 dark:bg-black/60" />
      <DialogPrimitive.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
        <DialogPrimitive.Popup
          ref={ref}
          data-slot="dialog-content"
          className={cn(
            "relative w-full max-w-md rounded-(--radius-overlay) border border-border bg-popover p-6 text-popover-foreground shadow-float outline-none",
            className
          )}
          {...props}
        >
          {children}
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label={closeLabel}
            className="absolute top-3.5 right-3.5 text-muted-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </DialogClose>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  )
}

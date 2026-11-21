"use client"

import { PrinterIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"

/** Opens the browser's print dialog, which can also save the document as a PDF. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <HugeiconsIcon icon={PrinterIcon} data-icon="inline-start" />
      {label}
    </Button>
  )
}

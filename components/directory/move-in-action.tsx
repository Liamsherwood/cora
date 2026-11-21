"use client"

import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useActionState, useState } from "react"

import type { ActionResult } from "@/app/[locale]/(demo)/actions"
import { ErrorText } from "@/components/partner-connect/status"
import { Button } from "@/components/ui/button"

import styles from "./move-in-action.module.css"

export function MoveInAction({
  action,
  disabled,
  started,
  startLabel,
  pendingLabel,
  startedLabel,
}: {
  action: () => Promise<ActionResult>
  disabled: boolean
  started: boolean
  startLabel: string
  pendingLabel: string
  startedLabel: string
}) {
  const [state, formAction, pending] = useActionState(() => action(), {
    error: null,
  })
  const [animate, setAnimate] = useState(false)

  return (
    <form action={formAction} className="contents">
      {started ? (
        <span
          className={`${styles.feedback} inline-flex h-9 min-w-36 items-center justify-center gap-1.5 rounded-(--radius-button) bg-success-surface px-3 text-sm font-medium whitespace-nowrap text-success`}
          data-animate={animate}
        >
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            className="size-4"
            aria-hidden
          />
          {startedLabel}
        </span>
      ) : (
        <Button
          type="submit"
          className="min-w-36 focus-visible:active:scale-100"
          disabled={disabled || pending}
          focusableWhenDisabled={pending}
          onClick={(event) => setAnimate(event.detail > 0)}
        >
          {pending ? (
            <span className={styles.feedback} data-animate={animate}>
              {pendingLabel}
            </span>
          ) : (
            startLabel
          )}
        </Button>
      )}
      <span role="status" className="sr-only">
        {started ? startedLabel : pending ? pendingLabel : null}
      </span>
      {!started && !pending && state.error && (
        <div className="basis-full">
          <ErrorText>{state.error}</ErrorText>
        </div>
      )}
    </form>
  )
}

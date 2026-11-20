"use client"

import { useActionState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"

import { ErrorText, Spinner } from "./status"

type Result = { error: string | null }

/**
 * A button that runs a (bound) Server Action, shows a spinner while it runs and the
 * error inline if it fails. The action refreshes the page itself on success.
 */
export function ActionButton({
  action,
  children,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "action" | "type"> & {
  action: () => Promise<Result>
}) {
  const [state, formAction, pending] = useActionState<Result>(() => action(), {
    error: null,
  })
  return (
    <form action={formAction} className="contents">
      <Button {...props} type="submit" disabled={pending || disabled}>
        {pending && <Spinner />}
        {children}
      </Button>
      {state.error && (
        <span className="basis-full">
          <ErrorText>{state.error}</ErrorText>
        </span>
      )}
    </form>
  )
}

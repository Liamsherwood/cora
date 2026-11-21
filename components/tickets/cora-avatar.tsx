"use client"

import dynamic from "next/dynamic"
import { useRef, useSyncExternalStore, type MouseEvent } from "react"

const BotAvatar = dynamic(
  () => import("bot-avatars").then((module) => module.BotAvatar),
  { ssr: false }
)

const motionQuery = "(prefers-reduced-motion: reduce)"
const restingPose = { yaw: 0 }
const nudgeMotion = {
  turn: 0.35,
  jumpEvery: 0,
  jumpHeight: 16,
  jumpTime: 0.25,
  jumpGroundTime: 0,
  jumpRiseTime: 0.12,
  jumpClickSquashTime: 0.08,
}

function subscribeToMotion(onChange: () => void) {
  const media = window.matchMedia(motionQuery)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

function prefersReducedMotion() {
  return window.matchMedia(motionQuery).matches
}

export function CoraAvatar({
  active = false,
  size = 96,
  label,
}: {
  active?: boolean
  size?: number
  label?: string
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeToMotion,
    prefersReducedMotion,
    () => true
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const feedbackRef = useRef<Animation | null>(null)
  const interactive = Boolean(label) && !reducedMotion
  const paused = reducedMotion || (!active && !interactive)
  const dimensions = { width: size, height: size }

  function nudge(event: MouseEvent<HTMLButtonElement>) {
    const canvas = canvasRef.current
    if (!canvas || event.target !== event.currentTarget) return

    if (reducedMotion || event.detail === 0) {
      feedbackRef.current?.cancel()
      feedbackRef.current = canvas.animate(
        [{ opacity: 1 }, { opacity: 0.65 }, { opacity: 1 }],
        150
      )
    } else {
      // Let the canvas run its built-in reaction while the button owns the hit area.
      canvas.click()
    }
  }

  const avatar = (
    <BotAvatar
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none"
      type="clover"
      size={size}
      state={active ? "working" : "default"}
      interactive={interactive}
      paused={paused}
      pose={paused ? restingPose : undefined}
      {...(interactive ? nudgeMotion : undefined)}
    />
  )

  if (label) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={nudge}
        className="flex shrink-0 items-center justify-center rounded-full"
        style={dimensions}
      >
        {avatar}
      </button>
    )
  }

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none flex shrink-0 items-center justify-center"
      style={dimensions}
    >
      {avatar}
    </span>
  )
}

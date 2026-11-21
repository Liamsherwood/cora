"use client"

import dynamic from "next/dynamic"
import { useRef, type MouseEvent } from "react"

import styles from "./activity-orb.module.css"

const ThinkingOrb = dynamic(() =>
  import("thinking-orbs").then((module) => module.ThinkingOrb)
)

export function ActivityOrb({
  sendingReply,
  label,
}: {
  sendingReply: boolean
  label: string
}) {
  const orbRef = useRef<HTMLSpanElement>(null)

  function reactToClick(event: MouseEvent<HTMLButtonElement>) {
    const orb = orbRef.current
    if (!orb) return

    const previous = orb.getAnimations()
    const style = getComputedStyle(orb)
    const { transform, opacity } = style
    const easing = style.getPropertyValue("--ease-press").trim()
    previous.forEach((animation) => animation.cancel())

    if (
      event.detail === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      orb.animate([{ opacity }, { opacity: 0.6 }, { opacity: 1 }], {
        duration: 150,
        easing,
      })
      return
    }

    orb.animate(
      [
        { transform, opacity },
        {
          transform: "translateY(-5px) rotate(-12deg) scale(1.12)",
          opacity: 1,
          offset: 0.45,
        },
        { transform: "translateY(1px) scale(1.08, 0.92)", offset: 0.75 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 240, easing }
    )
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={reactToClick}
      className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-info/10 active:bg-info/15"
    >
      <span ref={orbRef} aria-hidden="true" className="block size-5">
        <span className={`block size-5 ${styles.blink}`}>
          <ThinkingOrb
            state={sendingReply ? "connecting" : "searching"}
            size={20}
          />
        </span>
      </span>
    </button>
  )
}

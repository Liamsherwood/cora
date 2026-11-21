"use client"

import dynamic from "next/dynamic"

const ThinkingOrb = dynamic(() =>
  import("thinking-orbs").then((module) => module.ThinkingOrb)
)

export function ActivityOrb({ sendingReply }: { sendingReply: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-5 shrink-0 place-items-center"
    >
      <ThinkingOrb
        state={sendingReply ? "connecting" : "searching"}
        size={20}
      />
    </span>
  )
}

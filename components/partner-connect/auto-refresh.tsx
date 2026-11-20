"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Keeps a server-rendered screen live: re-renders it on the server every `intervalMs`
 * while the tab is visible, and right away when the tab becomes visible again. Changes
 * from other screens (tenant portal, partner webhooks, voice agent) show up without polling
 * individual JSON endpoints.
 */
export function AutoRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    const id = setInterval(tick, intervalMs)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [router, intervalMs])
  return null
}

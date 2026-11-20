"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type ApiError = { error: string; message: string; details?: unknown }

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  const body = await res
    .json()
    .catch(() => ({ error: "bad_response", message: `HTTP ${res.status}` }))
  if (!res.ok) throw body as ApiError
  return body as T
}

/** Polls an endpoint so every screen updates live; never overlaps requests. */
export function usePoll<T>(url: string | null, intervalMs = 1500) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const current = useRef(url)

  useEffect(() => {
    current.current = url
  }, [url])

  const refresh = useCallback(async () => {
    if (!url || busy.current) return
    busy.current = true
    try {
      const next = await api<T>(url)
      // Drop responses for a URL we've since navigated away from (e.g. switching units).
      if (current.current !== url) return
      setData(next)
      setError(null)
    } catch (e) {
      if (current.current === url)
        setError((e as ApiError).message ?? "Couldn't load data.")
    } finally {
      busy.current = false
    }
  }, [url])

  useEffect(() => {
    if (!url) return
    const first = setTimeout(() => void refresh(), 0)
    const id = setInterval(() => void refresh(), intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [url, intervalMs, refresh])

  return { data, error, refresh }
}

/** Wraps an action button: one request at a time, error shown inline. */
export function useAction() {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setPending(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as ApiError).message ?? "That didn't work. Try again.")
    } finally {
      setPending(null)
    }
  }, [])
  return { pending, error, run }
}

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
})

/** Integer cents (offer snapshot, metrics) -> "34,99 €". */
export const eur = (cents: number) => EUR.format(cents / 100)

/** EUR decimal string from a money column ("34.99") -> "34,99 €". */
export const eurDecimal = (v: string | null | undefined) =>
  v == null ? "–" : EUR.format(Number(v))

export const day = (d: string | null | undefined) =>
  d
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "–"

export const time = (ts: string | null | undefined) => {
  if (!ts) return "–"
  const d = new Date(ts)
  return Number.isNaN(d.getTime())
    ? "–"
    : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

/** Deterministic, name-based UUID (SHA-256, version 8 layout): same name -> same id. */
export async function nameUuid(name: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name))
  ).slice(0, 16)
  hash[6] = (hash[6]! & 0x0f) | 0x80 // version 8 (custom)
  hash[8] = (hash[8]! & 0x3f) | 0x80 // RFC 4122 variant
  const hex = [...hash].map((b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

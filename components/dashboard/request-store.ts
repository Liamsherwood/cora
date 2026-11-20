import { useMemo, useSyncExternalStore } from "react"

import { demoRequests, type Request, type RequestState } from "./data"
import { useDashboardLocale } from "./locale"

const storageKey = "cora.demo.requests.v1"
const changeEvent = "cora:requests-change"
const demoSnapshot = JSON.stringify(demoRequests)
let inMemorySnapshot: string | null = null

function getSnapshot() {
  if (inMemorySnapshot !== null) {
    return inMemorySnapshot
  }
  try {
    return localStorage.getItem(storageKey) ?? demoSnapshot
  } catch {
    return demoSnapshot
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(changeEvent, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(changeEvent, callback)
  }
}

function readRequests(snapshot: string): readonly (Request | RequestState)[] {
  try {
    const records = JSON.parse(snapshot)
    return Array.isArray(records) ? records : demoRequests
  } catch {
    return demoRequests
  }
}

export function useRequests() {
  const { messages } = useDashboardLocale()
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => demoSnapshot
  )

  return useMemo(() => {
    const demoContent = new Map<string, Pick<Request, "title" | "description">>(
      demoRequests.map(({ id }) => [id, messages.demoRequests[id]])
    )
    return readRequests(snapshot).flatMap((record) => {
      const content = demoContent.get(record.id)
      if (content) return [{ ...record, ...content }]
      return "title" in record ? [record] : []
    })
  }, [snapshot, messages.demoRequests])
}

export function updateRequests(
  update: (
    requests: readonly (Request | RequestState)[]
  ) => (Request | RequestState)[]
) {
  const snapshot = JSON.stringify(update(readRequests(getSnapshot())))
  try {
    localStorage.setItem(storageKey, snapshot)
    inMemorySnapshot = null
  } catch {
    inMemorySnapshot = snapshot
  }
  window.dispatchEvent(new Event(changeEvent))
}

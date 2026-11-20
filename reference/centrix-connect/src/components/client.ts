"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ApiError = { error: string; message: string; details?: unknown };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({ error: "bad_response", message: `HTTP ${res.status}` }));
  if (!res.ok) throw body as ApiError;
  return body as T;
}

/** Polls an endpoint so every screen updates live; never overlaps requests. */
export function usePoll<T>(url: string | null, intervalMs = 1500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const current = useRef(url);
  current.current = url;

  const refresh = useCallback(async () => {
    if (!url || busy.current) return;
    busy.current = true;
    try {
      const next = await api<T>(url);
      // Drop responses for a URL we've since navigated away from (e.g. switching units/runs).
      if (current.current !== url) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (current.current === url) setError((e as ApiError).message ?? "Couldn't load data.");
    } finally {
      busy.current = false;
    }
  }, [url]);

  useEffect(() => {
    void refresh();
    if (!url) return;
    const id = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(id);
  }, [url, intervalMs, refresh]);

  return { data, error, refresh };
}

/** Wraps an action button: one request at a time, error shown inline. */
export function useAction() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setPending(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as ApiError).message ?? "That didn't work. Try again.");
    } finally {
      setPending(null);
    }
  }, []);
  return { pending, error, run };
}

export const eur = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
export const day = (d: string | null | undefined) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–";
/** Postgres returns "2026-11-20 09:14:03.1+00"; Safari/Firefox can't parse that, so normalise to ISO first. */
export function parseTs(v: string): Date {
  const iso = v.includes("T") ? v : v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return new Date(iso);
}
export const time = (ts: string) => {
  const d = parseTs(ts);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

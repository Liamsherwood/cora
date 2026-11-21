"use server"

import { z } from "zod"

import { getDb } from "@/lib/db"
import {
  advanceDispatch,
  listDispatches,
  startDispatch,
} from "@/lib/dispatch/engine"
import type { DispatchView } from "@/lib/dispatch/steps"
import { AppError } from "@/lib/errors"

/*
 * Server Actions behind "Hand to Cora" on the maintenance dashboard. Like the other demo
 * actions they have no auth yet; every input is validated here.
 */

type Result<T> = { data: T; error: null } | { data: null; error: string }

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await fn(), error: null }
  } catch (e) {
    if (e instanceof AppError) return { data: null, error: e.message }
    console.error("[dispatch action] unhandled error", e)
    return { data: null, error: "Something went wrong on our side." }
  }
}

const StartInput = z.object({
  requestKey: z.string().trim().min(1).max(100),
  propertyId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000),
  priority: z.enum(["Routine", "High", "Urgent"]),
})

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new AppError("Invalid input.", 400, "bad_request")
  return parsed.data
}

export async function startDispatchAction(
  input: z.input<typeof StartInput>
): Promise<Result<DispatchView>> {
  return run(() => startDispatch(getDb(), parse(StartInput, input)))
}

export async function advanceDispatchAction(
  id: string
): Promise<Result<DispatchView>> {
  return run(() => advanceDispatch(getDb(), parse(z.uuid(), id)))
}

export async function listDispatchesAction(): Promise<Result<DispatchView[]>> {
  return run(() => listDispatches(getDb()))
}

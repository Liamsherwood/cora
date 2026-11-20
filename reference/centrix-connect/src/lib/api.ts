import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getDb, type DB } from "@/db/client";
import { NotFoundError } from "@/centrix/repository";
import { AppError } from "./errors";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

/** Wraps a route: one DB handle, typed errors -> HTTP codes, no stack traces leaked to clients. */
export async function handle(fn: (db: DB) => Promise<unknown>, status = 200) {
  try {
    const db = await getDb();
    return json(await fn(db), status);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.code, message: e.message, details: e.details ?? null }, e.status);
    if (e instanceof NotFoundError) return json({ error: "not_found", message: e.message }, 404);
    console.error("[api] unhandled error", e);
    return json({ error: "internal", message: "Something went wrong on our side." }, 500);
  }
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("body must be valid JSON", 400, "bad_request");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("invalid request body", 400, "bad_request", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return parsed.data;
}

export function demoOnly() {
  if (process.env.DEMO_MODE !== "true") throw new AppError("not found", 404, "not_found");
}

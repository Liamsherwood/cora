import {
  Building03Icon,
  DashboardSquare01Icon,
  Money03Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"

/** The dashboard's in-page views (no "use client": the server validates `?view=`). */
export const views = [
  { id: "overview", icon: DashboardSquare01Icon },
  { id: "properties", icon: Building03Icon },
  { id: "maintenance", icon: Wrench01Icon },
  { id: "rent", icon: Money03Icon },
] as const

export type View = (typeof views)[number]["id"]

/** Where the user is: a dashboard view, or one of the workspace's own pages. */
export type Section = View | "tickets" | "services"

export function isView(value: unknown): value is View {
  return views.some(({ id }) => id === value)
}

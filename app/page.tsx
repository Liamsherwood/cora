import { redirect } from "next/navigation"

/** The app is the Partner Connect demo for now: start in the property manager's view. */
export default function Page() {
  redirect("/centrix")
}

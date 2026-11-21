/** Fixed ids from data/seed.json, so the demo pages can link to each other. */
export const DEMO_TENANT_ID = "40000000-0000-4000-8000-000000000202" // Liam Sherwood
export const DEMO_UNIT_ID = "30000000-0000-4000-8000-00000000004b" // Unit 4B

/**
 * The first name Cora greets the tenant with. In a live demo the presenter plays the
 * tenant (DEMO_TENANT_PHONE_OVERRIDE rings their phone), so DEMO_TENANT_NAME_OVERRIDE
 * makes the greeting match the person who picks up.
 */
export function greetingName(fullName: string | null | undefined) {
  return (
    process.env.DEMO_TENANT_NAME_OVERRIDE?.trim() ||
    (fullName ?? "").split(" ")[0] ||
    ""
  )
}

/** Agreed workflow states. Fixed – do not rename without telling the team. */
export const WORKFLOW_STATES = [
  "detected",
  "offer_sent",
  "consent_given",
  "ordered",
  "confirmed",
  "active",
  "closed",
  "no_eligible_offer",
  "declined",
  "rejected",
] as const

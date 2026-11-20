import type { getRunView } from "@/workflow/engine";
import type { UnitSnapshot } from "@/centrix/repository";
import type { workflowRuns } from "@/db/schema";

export type RunView = Awaited<ReturnType<typeof getRunView>>;
export type RunRow = typeof workflowRuns.$inferSelect;
export type UnitResponse = { snapshot: UnitSnapshot; workflows: RunRow[] };
export type PartnerOrder = {
  id: string;
  partner_id: string;
  partner_name: string;
  status: string;
  start_date: string;
  created_at: string;
  received: Record<string, unknown>;
  statuses: string[];
};

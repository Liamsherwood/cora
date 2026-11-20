import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/*
 * Three areas, separated by table prefix:
 *   centrix_*  – the property manager's source of truth (mocked; real centrix would sit behind an API)
 *   partner_*  – partner catalogue, orders and consent
 *   ai_*       – our operational state: workflow runs, conversations, audit log
 *
 * IDs are stable text keys (e.g. "unit_4b", "c_202") so demo data is deterministic.
 * Money is stored in integer cents. Calendar dates are DATE columns read as strings
 * (YYYY-MM-DD) to avoid timezone shifts.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const day = (name: string) => date(name, { mode: "string" });

// ---------------------------------------------------------------- centrix_*

export const properties = pgTable("centrix_property", {
  id: text("id").primaryKey(),
  name: text("name"),
  street: text("street").notNull(),
  postcode: text("postcode").notNull(),
  city: text("city").notNull(),
  isWeg: boolean("is_weg").notNull().default(false),
});

export const buildings = pgTable("centrix_building", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => properties.id),
  buildingYear: integer("building_year"),
  heatingType: text("heating_type"),
  energyClass: text("energy_class"),
  energyCertificateValidUntil: day("energy_certificate_valid_until"),
});

export const units = pgTable("centrix_unit", {
  id: text("id").primaryKey(),
  buildingId: text("building_id").notNull().references(() => buildings.id),
  identifier: text("identifier").notNull(),
  floor: integer("floor"),
  sizeSqm: integer("size_sqm"),
  rooms: integer("rooms"),
});

export const parties = pgTable("centrix_party", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // person | organization
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  language: text("language").notNull().default("de"),
});

export const ownerships = pgTable(
  "centrix_ownership",
  {
    partyId: text("party_id").notNull().references(() => parties.id),
    unitId: text("unit_id").notNull().references(() => units.id),
    meaShare: numeric("mea_share"),
    validFrom: day("valid_from"),
    validTo: day("valid_to"),
  },
  (t) => [primaryKey({ columns: [t.partyId, t.unitId] })],
);

export const leases = pgTable("centrix_lease", {
  id: text("id").primaryKey(),
  unitId: text("unit_id").notNull().references(() => units.id),
  rentColdCents: integer("rent_cold_cents"),
  startDate: day("start_date").notNull(),
  endDate: day("end_date"),
});

export const leaseParties = pgTable(
  "centrix_lease_party",
  {
    leaseId: text("lease_id").notNull().references(() => leases.id),
    partyId: text("party_id").notNull().references(() => parties.id),
    role: text("role").notNull(), // tenant | co_tenant | guarantor
  },
  (t) => [primaryKey({ columns: [t.leaseId, t.partyId] })],
);

export const mandates = pgTable("centrix_mandate", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => properties.id),
  grantorPartyId: text("grantor_party_id").references(() => parties.id),
  type: text("type").notNull(), // weg | rental
  approvalLimitCents: integer("approval_limit_cents"),
});

export const assets = pgTable("centrix_asset", {
  id: text("id").primaryKey(),
  buildingId: text("building_id").notNull().references(() => buildings.id),
  unitId: text("unit_id").references(() => units.id),
  assetType: text("asset_type").notNull(),
  ownershipScope: text("ownership_scope").notNull().default("common"), // common | special
});

export const meters = pgTable("centrix_meter", {
  id: text("id").primaryKey(),
  unitId: text("unit_id").notNull().references(() => units.id),
  type: text("type").notNull(), // electricity | gas | water | heat
  number: text("number").notNull(),
});

export const cases = pgTable("centrix_case", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull().references(() => properties.id),
  unitId: text("unit_id").references(() => units.id),
  reporterPartyId: text("reporter_party_id").references(() => parties.id),
  assetId: text("asset_id").references(() => assets.id),
  category: text("category").notNull(),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
});

export const workOrders = pgTable("centrix_work_order", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id),
  contractorId: text("contractor_id").references(() => parties.id),
  scheduledAt: ts("scheduled_at"),
  costEstimateCents: integer("cost_estimate_cents"),
  payer: text("payer"),
  status: text("status").notNull().default("open"),
});

export const documents = pgTable("centrix_document", {
  id: text("id").primaryKey(),
  caseId: text("case_id").references(() => cases.id),
  unitId: text("unit_id").references(() => units.id),
  type: text("type").notNull(),
  url: text("url").notNull(),
});

export const events = pgTable("centrix_event", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  unitId: text("unit_id").notNull().references(() => units.id),
  partyId: text("party_id").references(() => parties.id),
  occurredAt: ts("occurred_at").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
});

/** Result written back to the unit (the "service contract" in the reltix example payload). */
export const serviceContracts = pgTable("centrix_service_contract", {
  id: text("id").primaryKey(),
  unitId: text("unit_id").notNull().references(() => units.id),
  partyId: text("party_id").notNull().references(() => parties.id),
  partnerName: text("partner_name").notNull(),
  category: text("category").notNull(),
  product: text("product").notNull(),
  status: text("status").notNull(), // signed | active | cancelled
  startDate: day("start_date").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  bridge: jsonb("bridge").$type<{ product: string; until: string } | null>(),
  consent: jsonb("consent").$type<{ data_shared: string[]; given_at: string; channel: string }>().notNull(),
  sourceOrderId: text("source_order_id").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

// ---------------------------------------------------------------- partner_*

export const partners = pgTable("partner_partner", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  manifest: jsonb("manifest").$type<unknown>().notNull(),
});

export const partnerOffers = pgTable("partner_offer", {
  id: text("id").primaryKey(),
  partnerId: text("partner_id").notNull().references(() => partners.id),
  product: text("product").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  leadTimeBusinessDays: integer("lead_time_business_days").notNull(),
  eligibility: jsonb("eligibility").$type<unknown>().notNull(),
});

export const consents = pgTable("partner_consent", {
  id: text("id").primaryKey(),
  partyId: text("party_id").notNull().references(() => parties.id),
  partnerId: text("partner_id").notNull().references(() => partners.id),
  workflowRunId: text("workflow_run_id").notNull(),
  dataShared: jsonb("data_shared").$type<string[]>().notNull(),
  purpose: text("purpose").notNull(),
  channel: text("channel").notNull(), // voice | portal | email | whatsapp
  givenAt: ts("given_at").notNull(),
  revokedAt: ts("revoked_at"),
});

export const serviceOrders = pgTable(
  "partner_service_order",
  {
    id: text("id").primaryKey(),
    offerId: text("offer_id").notNull().references(() => partnerOffers.id),
    partnerId: text("partner_id").notNull().references(() => partners.id),
    unitId: text("unit_id").notNull().references(() => units.id),
    partyId: text("party_id").notNull().references(() => parties.id),
    consentId: text("consent_id").notNull().references(() => consents.id),
    workflowRunId: text("workflow_run_id").notNull(),
    /** Exactly what the partner received – only consented fields. */
    sharedPayload: jsonb("shared_payload").$type<Record<string, unknown>>().notNull(),
    startDate: day("start_date").notNull(),
    status: text("status").notNull(), // sent | accepted | scheduled | active | rejected
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("service_order_workflow_unique").on(t.workflowRunId)],
);

// ---------------------------------------------------------------- ai_*

export const workflowRuns = pgTable(
  "ai_workflow_run",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    caseId: text("case_id"),
    unitId: text("unit_id").notNull(),
    partyId: text("party_id").notNull(),
    partnerId: text("partner_id"),
    offerId: text("offer_id"),
    state: text("state").notNull(),
    /** Snapshot of the computed offer (price, start date, bridge) shown to the tenant. */
    offer: jsonb("offer").$type<Record<string, unknown> | null>(),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  // One run per (event, partner): a re-delivered event must not start a second flow.
  (t) => [uniqueIndex("workflow_event_partner_unique").on(t.eventId, t.partnerId)],
);

export const conversations = pgTable("ai_conversation", {
  id: text("id").primaryKey(),
  workflowRunId: text("workflow_run_id").notNull().references(() => workflowRuns.id),
  channel: text("channel").notNull(),
  participants: jsonb("participants").$type<string[]>().notNull(),
  externalThreadId: text("external_thread_id"),
});

export const messages = pgTable("ai_message", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  senderPartyId: text("sender_party_id"), // null = system / agent
  role: text("role").notNull(), // agent | tenant | system | partner
  content: text("content").notNull(),
  sentAt: ts("sent_at").notNull(),
});

export const auditEvents = pgTable(
  "ai_audit_event",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id").notNull().references(() => workflowRuns.id),
    type: text("type").notNull(), // state_change | proposal | policy | approval | execution | message | error
    actor: text("actor").notNull(), // system | ai | tenant | partner | property_manager
    fromState: text("from_state"),
    toState: text("to_state"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    costCents: integer("cost_cents").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    occurredAt: ts("occurred_at").notNull(),
  },
  (t) => [uniqueIndex("audit_idempotency_unique").on(t.idempotencyKey)],
);

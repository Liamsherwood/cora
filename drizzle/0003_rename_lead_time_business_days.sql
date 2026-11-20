-- The offer lead time is counted in business days (weekends and public holidays excluded).
-- Renamed so the column says so. The check constraint follows the column automatically.
ALTER TABLE "partner_offers" RENAME COLUMN "lead_time_days" TO "lead_time_business_days";

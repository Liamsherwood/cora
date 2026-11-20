/**
 * Prints the webhook secret to hand to one partner (derived from PARTNER_WEBHOOK_SECRET
 * unless PARTNER_SECRET_<SLUG> is set).
 *
 *   npm run partner:secret -- example_fibre
 */
import nextEnv from "@next/env"

import { partnerSecret } from "@/lib/partner/signature"

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")

const slug = process.argv[2]
if (!slug || !/^[a-z0-9_]+$/.test(slug)) {
  console.error("Usage: npm run partner:secret -- <partner manifest id>")
  process.exit(1)
}
console.log(partnerSecret(slug))

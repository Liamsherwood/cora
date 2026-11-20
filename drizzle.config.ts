import { loadEnvConfig } from "@next/env"
import { defineConfig } from "drizzle-kit"

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL

function databaseCredentials(url: string | undefined) {
  if (!url) return undefined

  const ca = process.env.SUPABASE_DB_CA_CERT
  if (!ca) return { url }

  // Drizzle Kit accepts custom TLS options with separate connection fields.
  const connection = new URL(url)
  return {
    host: connection.hostname,
    port: Number(connection.port || 5432),
    user: decodeURIComponent(connection.username),
    password: decodeURIComponent(connection.password),
    database: decodeURIComponent(connection.pathname.slice(1)),
    ssl: { ca, rejectUnauthorized: true },
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: databaseCredentials(url),
})

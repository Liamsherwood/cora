import "server-only"

import { createPostgresState } from "@chat-adapter/state-pg"
import {
  createWhatsAppAdapter,
  type WhatsAppRawMessage,
} from "@chat-adapter/whatsapp"
import { generateText, type ModelMessage } from "ai"
import { Chat, ConsoleLogger, type Thread } from "chat"
import { Pool } from "pg"

const day = 24 * 60 * 60 * 1000
const fallbackReply =
  "Cora ist vorübergehend nicht verfügbar. Bitte versuche es gleich noch einmal.\n\nCora is temporarily unavailable. Please try again in a moment."

const instructions = `You are Cora, an automated WhatsApp assistant for property management.
Use the language of the latest message and keep your reply short and conversational.
Help with maintenance inquiries by asking one question at a time about the issue and the unit or location.
For immediate danger, direct the person to local emergency services.
For requests requiring a person or access to records, direct them to contact their property manager.
Never claim you filed a request, contacted someone, scheduled work, or accessed property or tenant records.
Never ask for payment details, passwords, or identity documents.
Politely redirect unrelated requests to property-management topics.`

async function postReply(thread: Thread, text: string, kind: "echo" | "assistant") {
  console.info("WhatsApp reply sending", { kind })
  await thread.post({ raw: text })
  console.info("WhatsApp reply accepted by Meta", { kind })
}

function createBot() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for WhatsApp state")
  }

  const connection = new URL(databaseUrl)
  const ca = process.env.SUPABASE_DB_CA_CERT
  if (ca) {
    // A URL sslmode would override the explicit CA in node-postgres.
    connection.searchParams.delete("sslmode")
  }

  const client = new Pool({
    connectionString: connection.toString(),
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 20000,
    max: 2,
    onConnect: (connection) => connection.query("SET search_path TO cora_chat"),
  })
  client.on("error", (error) => {
    console.error("WhatsApp state connection failed", error.name)
  })

  const logger = new ConsoleLogger("silent")
  const whatsapp = createWhatsAppAdapter({ userName: "Cora", logger })
  const state = createPostgresState({ client, autoCreateSchema: false, logger })
  const bot = new Chat({
    userName: "Cora",
    adapters: { whatsapp },
    state,
    logger,
    lockScope: "thread",
    concurrency: "queue",
    dedupeTtlMs: 7 * day,
    history: { thread: { maxMessages: 1, ttlMs: day } },
  })

  bot.onDirectMessage(async (thread, message, _channel, context) => {
    const textParts: string[] = []
    for (const entry of [...(context?.skipped ?? []), message]) {
      const raw = entry.raw as WhatsAppRawMessage | null
      if (raw?.message.type !== "text") continue
      if (raw.phoneNumberId !== process.env.WHATSAPP_PHONE_NUMBER_ID) {
        console.info("WhatsApp reply skipped", {
          reason: "phone_number_id_mismatch",
        })
        continue
      }

      if (entry.text === "Test!") {
        await postReply(thread, "Received: Test!", "echo")
        continue
      }

      const text = entry.text.trim()
      if (text) textParts.push(text)
    }

    const text = textParts.join("\n")
    if (!text) return

    const conversationKey = `cora:whatsapp:conversation:${thread.id}`
    const conversation =
      (await state.get<ModelMessage[]>(conversationKey)) ?? []
    conversation.push({ role: "user", content: text })

    let reply = fallbackReply
    try {
      const result = await generateText({
        model: process.env.WHATSAPP_AI_MODEL || "openai/gpt-5-mini",
        instructions,
        messages: conversation,
        maxOutputTokens: 600,
        reasoning: "minimal",
        timeout: 20_000,
        maxRetries: 0,
      })
      reply = result.text.trim() || fallbackReply
    } catch (error) {
      console.error(
        "WhatsApp model request failed",
        error instanceof Error ? error.name : ""
      )
    }

    await postReply(thread, reply, "assistant")
    if (reply !== fallbackReply) {
      conversation.push({ role: "assistant", content: reply })
      await state.set(conversationKey, conversation.slice(-8), day)
    }
  })

  return bot
}

let bot: ReturnType<typeof createBot> | undefined

export function getWhatsAppBot() {
  return (bot ??= createBot())
}

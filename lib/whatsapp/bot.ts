import "server-only"

import { createHmac } from "node:crypto"
import { createPostgresState } from "@chat-adapter/state-pg"
import {
  createWhatsAppAdapter,
  type WhatsAppRawMessage,
} from "@chat-adapter/whatsapp"
import { generateText, tool, type ModelMessage } from "ai"
import { Chat, ConsoleLogger, type Thread } from "chat"
import { Pool } from "pg"
import { z } from "zod"

import { coraPersonality } from "@/lib/cora"
import { getDb } from "@/lib/db"
import { ticketRef } from "@/lib/ids"
import { finishTicketIntake, startTicketIntake } from "@/lib/tickets/activity"
import {
  classificationInstructions,
  ticketClassification,
} from "@/lib/tickets/classification"
import {
  saveTicketRun,
  setTicketRunSendStatus,
  type TicketReport,
} from "@/lib/tickets/repository"

const day = 24 * 60 * 60 * 1000
const fallbackReply =
  "Cora ist vorübergehend nicht verfügbar. Bitte versuchen Sie es gleich noch einmal.\n\nCora is temporarily unavailable. Please try again in a moment."

const instructions = `${coraPersonality}
Keep WhatsApp replies short and conversational. For maintenance inquiries, ask about the problem and where it is happening. For requests requiring a person or access to records, direct the resident to their property manager. Politely redirect unrelated questions.
For immediate danger, direct the resident to local emergency services (112 in Germany).`

const ticketInstructions = `
Use review_resident_message to draft your reply and decide whether to file a maintenance report:
- Use "report" for a concrete maintenance problem the resident says is happening. Use "follow_up" when the resident only adds details about a problem already discussed.
- Return null for greetings, general questions, hypothetical problems, unclear issues, or requests unrelated to maintenance.
- Give the report an English title of 3 to 6 words naming the fault and where it is, such as "Kitchen tap leaking". No names.
- Summarize the reported problem and its location when known, in the resident's language and under 400 characters. Carry relevant facts forward from the conversation. Omit names, phone numbers, email addresses, full street addresses, access codes, payment information, and identity details.
- Write the reply in the language of the latest message. Ask for any missing detail that would help the property manager. Cora adds the ticket reference after saving. Leave any confirmation or reference out of the draft.
${classificationInstructions}
`

const reviewResidentMessage = tool({
  description:
    "Review the resident's latest WhatsApp message and supply a classified issue for the ticket workflow when applicable.",
  inputSchema: z.object({
    reply: z.string(),
    report: z
      .object({
        kind: z.enum(["report", "follow_up"]),
        // Clipped on save rather than limited here: a long title must not cost the report.
        title: z.string(),
        summary: z.string().trim().min(1).max(400),
        classification: ticketClassification,
      })
      .nullable(),
  }),
})

function logTicketError(error: unknown) {
  console.error(
    "WhatsApp ticket trace failed",
    error instanceof Error ? error.name : ""
  )
}

async function postReply(
  thread: Thread,
  text: string,
  kind: "echo" | "assistant"
) {
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
    let latestMessageId = ""
    let senderPhone: string | undefined
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
      if (text) {
        textParts.push(text)
        latestMessageId = raw.message.id
        senderPhone = raw.message.from
      }
    }

    const text = textParts.join("\n")
    if (!text) return

    const conversationKey = `cora:whatsapp:conversation:${thread.id}`
    const conversation =
      (await state.get<ModelMessage[]>(conversationKey)) ?? []
    conversation.push({ role: "user", content: text })

    const threadSecret = process.env.TICKETING_THREAD_SECRET
    const model = process.env.WHATSAPP_AI_MODEL || "openai/gpt-5-mini"
    const startedAt = new Date()
    let reply = fallbackReply
    const digest = threadSecret
      ? (value: string) =>
          createHmac("sha256", threadSecret).update(value).digest("hex")
      : null
    const threadKey = digest?.(`thread:${thread.id}`)
    let intakeId = threadKey
      ? await startTicketIntake(getDb(), threadKey).catch(logTicketError)
      : null

    try {
      let report: TicketReport | null = null
      let gatewayGenerationId: string | undefined
      try {
        const result = await generateText({
          model,
          instructions: threadSecret
            ? instructions + ticketInstructions
            : instructions,
          messages: conversation,
          tools: { review_resident_message: reviewResidentMessage },
          toolChoice: threadSecret
            ? { type: "tool", toolName: "review_resident_message" }
            : "none",
          activeTools: threadSecret ? ["review_resident_message"] : [],
          maxOutputTokens: threadSecret ? 850 : 600,
          reasoning: "minimal",
          timeout: 20_000,
          maxRetries: 0,
        })
        const generationId = result.providerMetadata?.gateway?.generationId
        if (typeof generationId === "string") gatewayGenerationId = generationId
        if (threadSecret) {
          const review = result.staticToolCalls.find(
            (call) => call.toolName === "review_resident_message"
          )?.input
          if (review) {
            reply = review.reply.trim() || fallbackReply
            report = review.report
          }
        } else {
          reply = result.text.trim() || fallbackReply
        }
      } catch (error) {
        console.error(
          "WhatsApp model request failed",
          error instanceof Error ? error.name : ""
        )
      }

      const receipt =
        digest && threadKey
          ? await saveTicketRun(
              getDb(),
              {
                threadKey,
                messageKey: digest(`message:${thread.id}:${latestMessageId}`),
                agent: "cora-whatsapp",
                model,
                gatewayGenerationId,
                startedAt,
                report,
                senderPhone,
                replyType:
                  !report && reply === fallbackReply ? "fallback" : "generated",
              },
              intakeId ?? null
            ).catch(logTicketError)
          : null

      if (report && receipt) {
        reply = `${reply === fallbackReply ? "" : `${reply}\n\n`}Cora · Ticket ${ticketRef(receipt.ticketId)}`
      } else if (report?.kind === "report") {
        reply = fallbackReply
      }
      const runId = receipt?.id

      if (intakeId && !runId) {
        await finishTicketIntake(getDb(), intakeId).catch(logTicketError)
        intakeId = null
      }

      try {
        await postReply(thread, reply, "assistant")
      } catch (error) {
        if (runId) {
          await setTicketRunSendStatus(getDb(), runId, "failed").catch(
            logTicketError
          )
        }
        throw error
      }
      if (runId) {
        await setTicketRunSendStatus(getDb(), runId, "accepted").catch(
          logTicketError
        )
      }
    } finally {
      if (intakeId) {
        await finishTicketIntake(getDb(), intakeId).catch(logTicketError)
      }
    }
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

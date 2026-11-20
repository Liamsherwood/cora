import {
  verifyMetaSignature,
  verifyMetaWebhookChallenge,
} from "@chat-adapter/shared"
import { after } from "next/server"

import { getWhatsAppBot } from "@/lib/whatsapp/bot"

export const runtime = "nodejs"
export const maxDuration = 60

export function GET(request: Request) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (!verifyToken) {
    return new Response("WhatsApp webhook is not configured", { status: 503 })
  }

  const challenge = verifyMetaWebhookChallenge(
    new URL(request.url).searchParams,
    verifyToken
  )
  return challenge
    ? new Response(challenge)
    : new Response("Forbidden", { status: 403 })
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    return new Response("WhatsApp webhook is not configured", { status: 503 })
  }

  const signature = request.headers.get("x-hub-signature-256")
  if (
    !signature ||
    !verifyMetaSignature(await request.clone().text(), signature, appSecret)
  ) {
    return new Response("Invalid signature", { status: 401 })
  }

  try {
    return await getWhatsAppBot().webhooks.whatsapp(request, {
      propagateHandlerErrors: true,
      waitUntil: (task) => {
        after(
          task.catch((error: unknown) => {
            console.error(
              "WhatsApp reply failed",
              error instanceof Error ? error.name : ""
            )
          })
        )
      },
    })
  } catch (error) {
    console.error(
      "WhatsApp webhook failed",
      error instanceof Error ? error.name : ""
    )
    return new Response("WhatsApp webhook unavailable", { status: 503 })
  }
}

import "server-only"

/*
 * Cora's WhatsApp message to the contractor. A business may open a WhatsApp
 * conversation only with a template Meta has approved: with WHATSAPP_DISPATCH_TEMPLATE
 * set, the job goes out as that template (body {{1}} job, {{2}} address, {{3}} slot).
 * Without a template but with DEMO_CONTRACTOR_PHONE_OVERRIDE, the message goes out as
 * plain text to that demo phone, which works while it is inside Meta's 24-hour window
 * (send the bot any message first). Otherwise the message is simulated, so the demo
 * never depends on Meta. The contractor's reply comes back through the WhatsApp webhook.
 */

export type DispatchChannel =
  { mode: "simulated" } | { mode: "live"; to: string; template: string | null }

export function digits(phone: string) {
  return phone.replace(/\D/g, "")
}

export function dispatchChannel(
  contractorPhone: string | null
): DispatchChannel {
  const template = process.env.WHATSAPP_DISPATCH_TEMPLATE || null
  const override = process.env.DEMO_CONTRACTOR_PHONE_OVERRIDE || null
  const to = override ?? contractorPhone
  const credentials =
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!credentials || !to || (!template && !override))
    return { mode: "simulated" }
  return { mode: "live", to: digits(to), template }
}

export async function sendDispatchWhatsApp(
  channel: Extract<DispatchChannel, { mode: "live" }>,
  message: {
    text: string
    language: "de" | "en"
    params: [job: string, address: string, slot: string]
  }
) {
  const body = channel.template
    ? {
        type: "template",
        template: {
          name: channel.template,
          language: { code: message.language },
          components: [
            {
              type: "body",
              parameters: message.params.map((text) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      }
    : { type: "text", text: { body: message.text, preview_url: false } }

  const res = await fetch(
    `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: channel.to,
        ...body,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    throw new Error(error.error?.message ?? `HTTP ${res.status}`)
  }
}

import nextEnv from "@next/env"

import {
  DEFAULT_TEMPLATE_NAME,
  OPENER_BODY,
  OPENER_EXAMPLE,
  type TemplateLanguage,
} from "@/lib/whatsapp/template"

nextEnv.loadEnvConfig(process.cwd(), true)

/*
 * Submits Cora's WhatsApp opener (lib/whatsapp/template.ts) to Meta for approval, in
 * German and English, and prints the review status of each. Run again to see whether
 * Meta has approved it. Needs WHATSAPP_ACCESS_TOKEN (with whatsapp_business_management)
 * and WHATSAPP_BUSINESS_ACCOUNT_ID; the name is WHATSAPP_OFFER_TEMPLATE or the default.
 *
 *   npm run whatsapp:template
 */

const token = process.env.WHATSAPP_ACCESS_TOKEN
const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
const name = process.env.WHATSAPP_OFFER_TEMPLATE || DEFAULT_TEMPLATE_NAME
if (!token || !waba) {
  console.error(
    "Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID (WhatsApp Manager → Account tools → Phone numbers shows the account ID)."
  )
  process.exit(1)
}

const graph = `https://graph.facebook.com/v25.0/${waba}/message_templates`
const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
}

type Template = { name: string; language: string; status: string }

async function existing(): Promise<Template[]> {
  const res = await fetch(`${graph}?name=${name}&fields=name,language,status`, {
    headers,
  })
  const body = (await res.json()) as {
    data?: Template[]
    error?: { message: string }
  }
  if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
  return (body.data ?? []).filter((t) => t.name === name)
}

const have = await existing()
for (const language of Object.keys(OPENER_BODY) as TemplateLanguage[]) {
  const found = have.find((t) => t.language === language)
  if (found) {
    console.log(`${name} (${language}): ${found.status}`)
    continue
  }
  const res = await fetch(graph, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name,
      language,
      // An offer is marketing in Meta's terms; filing it as utility gets it reclassified.
      category: "MARKETING",
      components: [
        {
          type: "BODY",
          text: OPENER_BODY[language],
          example: { body_text: [OPENER_EXAMPLE[language]] },
        },
      ],
    }),
  })
  const body = (await res.json()) as {
    status?: string
    error?: { message: string; error_user_msg?: string }
  }
  if (!res.ok) {
    console.error(
      `${name} (${language}) rejected:`,
      body.error?.error_user_msg ?? body.error?.message ?? res.status
    )
    process.exitCode = 1
    continue
  }
  console.log(`${name} (${language}): submitted, ${body.status ?? "PENDING"}`)
}
console.log(
  `\nOnce APPROVED, set WHATSAPP_OFFER_TEMPLATE=${name} where the app runs.`
)

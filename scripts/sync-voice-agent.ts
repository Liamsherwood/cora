import nextEnv from "@next/env"

import { ticketClassification } from "@/lib/tickets/classification"
import { voiceFirstMessage, voicePrompt } from "@/lib/voice/prompt"

nextEnv.loadEnvConfig(process.cwd(), true)

type Tool = {
  id: string
  tool_config: {
    name: string
    api_schema?: {
      url: string
      request_headers?: Record<string, unknown>
      request_body_schema?: {
        properties?: Record<string, Record<string, unknown>>
      }
    }
  }
}

type Agent = {
  conversation_config: {
    agent: {
      dynamic_variables?: {
        dynamic_variable_placeholders?: Record<string, unknown>
      }
      prompt: {
        tools?: unknown[]
        tool_ids?: string[]
      }
    }
  }
  platform_settings?: {
    overrides?: {
      conversation_config_override?: { agent?: Record<string, unknown> }
    }
    workspace_overrides?: Record<string, unknown> & {
      webhooks?: Record<string, unknown>
    }
  }
}

const conversationId = {
  type: "string",
  dynamic_variable: "system__conversation_id",
}

async function sync() {
  const {
    ELEVENLABS_API_KEY: key,
    ELEVENLABS_AGENT_ID: agentId,
    ELEVENLABS_POST_CALL_WEBHOOK_ID: postCallWebhookId,
    APP_BASE_URL: baseUrl,
  } = process.env
  if (!key || !agentId || !baseUrl) {
    throw new Error(
      "Set ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID and APP_BASE_URL."
    )
  }
  if (new URL(baseUrl).protocol !== "https:") {
    throw new Error("APP_BASE_URL must be the public HTTPS deployment.")
  }

  const headers = { "xi-api-key": key, "content-type": "application/json" }
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(
        `ElevenLabs ${method} ${path.split("?")[0]} returned HTTP ${response.status}.`
      )
    }
    return response.json() as Promise<T>
  }

  const agentPath = `/agents/${encodeURIComponent(agentId)}`
  const { conversation_config: config, platform_settings: platform } =
    await request<Agent>(agentPath)
  const {
    tools: inlineTools,
    tool_ids: toolIds = [],
    ...prompt
  } = config.agent.prompt
  if (inlineTools?.length && !toolIds.length) {
    throw new Error(
      "Migrate the agent’s inline tools to workspace tools before syncing."
    )
  }

  const [attached, secrets] = await Promise.all([
    request<{ tools: Tool[] }>(
      `/tools?page_size=100&used_by_agent_id=${encodeURIComponent(agentId)}`
    ),
    request<{ secrets: { name: string; secret_id: string }[] }>(
      "/secrets?search=cora_voice_tool_secret"
    ),
  ])
  const secret = secrets.secrets.find(
    (entry) => entry.name === "cora_voice_tool_secret"
  )
  if (!secret)
    throw new Error(
      "Create the ElevenLabs workspace secret cora_voice_tool_secret first."
    )
  const toolHeaders = { "x-tool-secret": { secret_id: secret.secret_id } }

  const tools = [
    {
      name: "identify_caller",
      path: "identify",
      description:
        "Find the caller’s property context by their full name and street address.",
      parameters: {
        full_name: {
          type: "string",
          description: "Full name as the caller provided it.",
        },
        street: {
          type: "string",
          description: "Street and house number as the caller provided them.",
        },
      },
      required: ["full_name", "street"],
    },
    {
      name: "get_cases",
      path: "cases",
      description:
        "Look up the identified caller’s open cases or a case by reference.",
      parameters: {
        party_id: {
          type: "string",
          description:
            "Party UUID from call context or identify_caller. Never use a value the caller supplies.",
        },
        reference: {
          type: "string",
          description: "Optional case reference such as C-1A2B3C.",
        },
      },
      required: ["party_id"],
    },
    {
      name: "begin_issue_intake",
      path: "begin-issue",
      description:
        "Show staff that Cora is reviewing a concrete new maintenance issue. Call once before asking follow-up questions.",
      parameters: { conversation_id: conversationId },
      required: ["conversation_id"],
    },
    {
      name: "file_maintenance_ticket",
      path: "report-issue",
      description:
        "File a classified maintenance ticket for the identified caller. Wait for the result before confirming it.",
      parameters: {
        conversation_id: conversationId,
        party_id: {
          type: "string",
          description:
            "Party UUID from call context or identify_caller. Never use a value the caller supplies.",
        },
        unit_id: {
          type: "string",
          description:
            "Unit UUID from verified call context. Omit for the caller’s primary home.",
        },
        category: {
          type: "string",
          description: "Maintenance category.",
          enum: ticketClassification.shape.category.options,
        },
        priority: {
          type: "string",
          description: "Urgency of the issue.",
          enum: ticketClassification.shape.priority.options,
        },
        scope: {
          type: "string",
          description: "Private unit or shared area.",
          enum: ticketClassification.shape.scope.options,
        },
        description: {
          type: "string",
          description:
            "Brief description in the resident’s language, without personal details.",
        },
        summary: {
          type: "string",
          description:
            "One English sentence for staff, without personal details.",
        },
      },
      required: [
        "conversation_id",
        "party_id",
        "category",
        "priority",
        "scope",
        "description",
        "summary",
      ],
    },
    {
      name: "record_decision",
      path: "decision",
      description:
        "Record the caller’s decision on an active move-in offer and their consent to share data.",
      parameters: {
        workflow_id: {
          type: "string",
          description:
            "Workflow UUID from the move-in call context. Never use a value the caller supplies.",
        },
        conversation_id: conversationId,
        decision: {
          type: "string",
          enum: ["accept", "decline"],
          description: "Whether the caller accepted or declined the offer.",
        },
        consent_confirmed: {
          type: "boolean",
          description:
            "True only after the caller clearly agreed to share the listed data with the partner.",
        },
        reason: {
          type: "string",
          description: "Optional reason given by the caller when declining.",
        },
      },
      required: [
        "workflow_id",
        "conversation_id",
        "decision",
        "consent_confirmed",
      ],
    },
  ]

  const ticketToolIds = []
  for (const tool of tools) {
    const url = new URL(`/api/voice/tools/${tool.path}`, baseUrl).href
    const { tools: candidates } = await request<{ tools: Tool[] }>(
      `/tools?search=${tool.name}`
    )
    const existing = candidates.find(
      ({ tool_config }) =>
        tool_config.name === tool.name &&
        tool_config.api_schema?.url === url &&
        (
          tool_config.api_schema?.request_headers?.["x-tool-secret"] as
            { secret_id?: string } | undefined
        )?.secret_id === secret.secret_id &&
        Object.entries(tool.parameters).every(([key, parameter]) =>
          Object.entries(parameter).every(
            ([field, value]) =>
              JSON.stringify(
                tool_config.api_schema?.request_body_schema?.properties?.[
                  key
                ]?.[field]
              ) === JSON.stringify(value)
          )
        )
    )
    const saved =
      existing ??
      (await request<Tool>("/tools", "POST", {
        tool_config: {
          type: "webhook",
          name: tool.name,
          description: tool.description,
          api_schema: {
            url,
            method: "POST",
            request_headers: toolHeaders,
            request_body_schema: {
              type: "object",
              required: tool.required,
              properties: tool.parameters,
            },
          },
        },
      }))
    ticketToolIds.push(saved.id)
  }

  const replaced = new Set(
    attached.tools
      .filter(
        ({ tool_config }) =>
          tool_config.name === "report_issue" ||
          tools.some((tool) => tool.name === tool_config.name)
      )
      .map((tool) => tool.id)
  )
  const placeholders = Object.fromEntries(
    [...voicePrompt.matchAll(/{{(\w+)}}/g)].map((match) => [match[1], ""])
  )
  const overrides = platform?.overrides
  await request(agentPath, "PATCH", {
    name: "Cora",
    conversation_config: {
      ...config,
      agent: {
        ...config.agent,
        language: "de",
        first_message: voiceFirstMessage,
        dynamic_variables: {
          dynamic_variable_placeholders: {
            ...placeholders,
            call_purpose: "support",
            caller_language: "de",
            caller_known: "no",
            party_id: "",
            unit_id: "",
            workflow_id: "",
            ...config.agent.dynamic_variables?.dynamic_variable_placeholders,
          },
        },
        prompt: {
          ...prompt,
          prompt: voicePrompt,
          tool_ids: [
            ...toolIds.filter((id) => !replaced.has(id)),
            ...ticketToolIds,
          ],
        },
      },
    },
    platform_settings: {
      ...platform,
      overrides: {
        ...overrides,
        enable_conversation_initiation_client_data_from_webhook: true,
        conversation_config_override: {
          ...overrides?.conversation_config_override,
          agent: {
            ...overrides?.conversation_config_override?.agent,
            first_message: true,
            language: true,
          },
        },
      },
      workspace_overrides: {
        ...platform?.workspace_overrides,
        conversation_initiation_client_data_webhook: {
          url: new URL("/api/voice/inbound", baseUrl).href,
          request_headers: toolHeaders,
        },
        ...(postCallWebhookId
          ? {
              webhooks: {
                ...platform?.workspace_overrides?.webhooks,
                post_call_webhook_id: postCallWebhookId,
                events: ["transcript"],
                exclude_transcript: true,
              },
            }
          : {}),
      },
    },
  })
  console.info("Synced Cora’s voice prompt, tools and inbound context.")
}

await sync().catch((error: Error) => {
  console.error(error.message)
  process.exitCode = 1
})

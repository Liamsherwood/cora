# Cora voice agent (ElevenLabs)

One ElevenLabs agent handles every voice conversation: inbound calls from residents,
the outbound move-in offer call, and the voice widget in the tenant portal. WhatsApp
chat runs through the bot in `lib/whatsapp/bot.ts`. Both channels share Cora’s
personality and the maintenance ticket classification and workflow.

```
caller ──phone──▶ ElevenLabs agent ──webhook──▶ /api/voice/inbound           (who is calling)
                        │            ──tools────▶ /api/voice/tools/*           (cases, decisions)
                        └── after the call ─────▶ /api/voice/webhooks/post-call (summary on the unit)
```

| Piece | Route | What it does |
|---|---|---|
| Conversation initiation webhook | `POST /api/voice/inbound` | Recognises the caller by number, returns name, flat, open cases and last call as dynamic variables, plus a greeting and voice language for that person |
| Tool `identify_caller` | `POST /api/voice/tools/identify` | Without caller ID: full name + street must match exactly one resident |
| Tool `get_cases` | `POST /api/voice/tools/cases` | Open cases with status, next visit and contractor, or one case by reference (`C-1A2B3C`) |
| Tool `begin_issue_intake` | `POST /api/voice/tools/begin-issue` | Shows staff that Cora is reviewing an incoming maintenance report |
| Tool `file_maintenance_ticket` | `POST /api/voice/tools/report-issue` | Saves the titled, classified ticket with the resident's details, linked centrix case, `case.created` event and agent run together |
| Tool `record_decision` | `POST /api/voice/tools/decision` | Move-in offer: accept with consent, or decline |
| Post-call webhook | `POST /api/voice/webhooks/post-call` | Stores the call summary as a `call.completed` event; the next call starts from it |

Tools and the initiation webhook send `x-tool-secret` (ElevenLabs workspace secret
`cora_voice_tool_secret` = `VOICE_TOOL_SECRET`). The post-call webhook is HMAC-signed
with `ELEVENLABS_WEBHOOK_SECRET`. The agent only ever sees the caller's own flat and
cases: no rent, no owner data, no other residents.

## Setup checklist

1. Vercel (production) env: `VOICE_TOOL_SECRET`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`,
   `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`, and after step 4 `ELEVENLABS_WEBHOOK_SECRET`.
2. Create the workspace secret `cora_voice_tool_secret` with the same value as
   the deployed `VOICE_TOOL_SECRET`.
3. Phone: import a Twilio number in ElevenLabs → Phone Numbers, assign it to the agent,
   set `ELEVENLABS_PHONE_NUMBER_ID`. Inbound calls then go through `/api/voice/inbound`.
4. Post-call webhook: ElevenLabs → Settings → Webhooks, URL
   `https://<public-cora-host>/api/voice/webhooks/post-call`, copy the signing
   secret into `ELEVENLABS_WEBHOOK_SECRET`, and select it as the agent's post-call webhook.
   Set `ELEVENLABS_POST_CALL_WEBHOOK_ID` to attach the existing webhook through the sync command.

5. Apply the database migrations and deploy the platform with both ticket endpoints.
   Set the local `APP_BASE_URL` to that public HTTPS deployment and set `ELEVENLABS_AGENT_ID`
   to the agent to update. Use an `ELEVENLABS_API_KEY` with read and write access to
   the agent and tools and read access to workspace secrets. Run `npm run voice:sync`
   to publish Cora’s prompt and attach the tools. Sync also configures the inbound
   context webhook and enables greeting and language overrides. The ticket tools
   bind `conversation_id` to ElevenLabs’ `system__conversation_id`.

Open the live **Tickets** inbox and place a test call from a recognised resident.
Report a fictional maintenance issue and pause while Cora asks for more detail.
The inbox shows an incoming report during intake. After Cora reads a case
reference, open the ticket to see its title, summary, classification, the
resident's account and details, the next steps, and (once the post-call webhook
arrives) the call recap.

Deploy the app before running `npm run voice:sync` whenever the tool changes: the
endpoint accepts both the old and the new tool arguments, so either order works,
but the new fields are only stored once the deployment has them.

## What a ticket records

`file_maintenance_ticket` sends, besides the classification:

| Argument | Stored as | Notes |
|---|---|---|
| `title` | `maintenance_tickets.title` | English, 3–6 words. Tidied and clipped to 60 characters; the inbox falls back to the category for older tickets |
| `summary` | `maintenance_tickets.summary` | One or two English sentences for staff |
| `description` | `details.description` | The resident's account in their language |
| `location`, `since`, `resident_actions`, `safety_advice`, `access` | `details.*` | Optional; blank or `null` means unknown |

The resident's preferred language is added from centrix. Free text is clipped,
never rejected, and unknown arguments are ignored, so a long answer or a tool
schema out of step with the deployment never loses a report. Only `party_id` and
`unit_id` stay strict, because they must come from verified call context.

Next steps and the response target are plain rules in `lib/tickets/playbook.ts`,
not model output: the contractor trade follows the category, the target follows the
priority (emergency 2 h, high 24 h, normal 3 working days, low 10 working days, our
assumption of typical service levels), and visits, building notices and tenancy
linking are added when the ticket calls for them. The call recap is the
`call.completed` event the post-call webhook stores for the run's conversation ID.

## Dynamic variables

Every call gets the same keys (`supportContext` in `lib/voice/caller.ts`); outbound
offer calls add the offer fields (`buildDynamicVariables` in `lib/voice/elevenlabs.ts`).
Placeholders are set on the agent so a call without context never fails.

## System prompt

The voice prompt and default greeting live in [`lib/voice/prompt.ts`](../lib/voice/prompt.ts).
Inbound calls and outbound offers can supply a greeting from `lib/voice/greetings.ts`.

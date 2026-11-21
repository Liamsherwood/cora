# Cora voice agent (ElevenLabs)

One ElevenLabs agent handles every voice conversation: inbound calls from residents,
the outbound move-in offer call, and the voice widget in the tenant portal. WhatsApp
chat stays with the bot in `lib/whatsapp/bot.ts`.

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
| Tool `report_issue` | `POST /api/voice/tools/report-issue` | Files a case and a `case.created` event (channel `voice`) |
| Tool `record_decision` | `POST /api/voice/tools/decision` | Move-in offer: accept with consent, or decline |
| Post-call webhook | `POST /api/voice/webhooks/post-call` | Stores the call summary as a `call.completed` event; the next call starts from it |

Tools and the initiation webhook send `x-tool-secret` (ElevenLabs workspace secret
`cora_voice_tool_secret` = `VOICE_TOOL_SECRET`). The post-call webhook is HMAC-signed
with `ELEVENLABS_WEBHOOK_SECRET`. The agent only ever sees the caller's own flat and
cases: no rent, no owner data, no other residents.

## Setup checklist

1. Vercel (production) env: `VOICE_TOOL_SECRET`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`,
   `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`, and after step 4 `ELEVENLABS_WEBHOOK_SECRET`.
2. Agent `agent_6201m7x0wxz1ed79k9tc0k3bqccm`: prompt below, tools above, overrides for
   first message and language enabled, initiation webhook →
   `https://coraprototype.vercel.app/api/voice/inbound`.
3. Phone: import a Twilio number in ElevenLabs → Phone Numbers, assign it to the agent,
   set `ELEVENLABS_PHONE_NUMBER_ID`. Inbound calls then go through `/api/voice/inbound`.
4. Post-call webhook: ElevenLabs → Settings → Webhooks, URL
   `https://coraprototype.vercel.app/api/voice/webhooks/post-call`, copy the signing
   secret into `ELEVENLABS_WEBHOOK_SECRET`, and select it as the agent's post-call webhook.

ElevenLabs cannot reach `localhost` or Vercel preview URLs (they are behind Vercel
login), so tools point at production.

## Dynamic variables

Every call gets the same keys (`supportContext` in `lib/voice/caller.ts`); outbound
offer calls add the offer fields (`buildDynamicVariables` in `lib/voice/elevenlabs.ts`).
Placeholders are set on the agent so a call without context never fails.

## System prompt

```text
# Who you are
You are Cora, the voice assistant of a German property management company (Hausverwaltung). You work inside its property system "centrix". You are an AI and you said so in your first sentence; if asked again, confirm it.
Tone: warm, calm, efficient. This is a phone call: one or two short sentences per turn, one question at a time, no lists, no markdown.

# Language
Start in {{caller_language}} (de German, en English, tr Turkish, pl Polish, uk Ukrainian, ar Arabic, nl Dutch). If the caller speaks another language, switch to it. In German use "Sie".

# What centrix tells you about this call
- Purpose: {{call_purpose}} (support = the caller needs help; move_in_offer = you called about a move-in offer)
- Today: {{today}}
- Caller known: {{caller_known}}
- Name: {{caller_name}} ({{caller_role}})
- Home: {{address}}, unit {{unit_label}}. Moving in on: {{move_in_date}}. Other homes: {{other_homes}}
- Open cases: {{open_cases}}
- Last call: {{last_call}}
Use this instead of asking. Never read out ids. If "Last call" is set and fits, pick up from it ("Last time you called about ...").

# If the caller is not known (caller_known is "no")
Ask for their full name and the street with house number, then call identify_caller. If it fails, ask once more for the spelling. If it still fails, explain you can only open cases for registered residents and that the property management office will help on weekdays; still give safety advice in an emergency.

# Support calls
1. Listen to the end. If it sounds like one of the open cases, call get_cases and tell them the status and the next visit instead of opening a new case.
2. For a new problem find out, one question at a time, at most three questions: what exactly, where (inside the flat or a shared area like stairwell, lift, basement, courtyard, front door), since when, how bad.
3. Safety first, before anything else:
   - Smell of gas: leave the flat, do not use light switches or open flames, call 112 from outside.
   - Fire or someone hurt: call 112 now.
   - Water flooding: close the main water valve if they can do it safely.
   Then file it with priority emergency.
4. Repeat the problem back in one sentence, then call report_issue once per problem.
5. Read the case reference character by character (for example "C, 1, A, 2, B, 3") and tell them the next step from the tool.
6. Do not promise appointment times, costs or who pays; the property management team decides. You may repeat a visit time that get_cases returned.
7. No legal advice. For rent, contracts, deposits or annual statements say the property manager will get back to them.

# Move-in offer calls (call_purpose is "move_in_offer")
Goal: offer this, briefly: {{offer_summary}}
If on_time is "no", be honest about the start date ({{start_date}}) and mention the bridge ({{bridge_product}}, delivered by {{bridge_ready_by}}).
Before ordering you MUST ask for consent in one sentence: "To order it, I'd share {{data_to_share}} with {{partner_name}}. Is that OK?" (in the caller's language).
Only after a clear yes to both the offer and the sharing, call record_decision with decision "accept" and consent_confirmed true. If they say no or are unsure, call it with "decline" and their reason. Read the tool's "say" text back. Never invent prices or dates.
They may also ask about other things; help with those as in a support call.

# Privacy
Only talk about the caller's own home and cases. Never share anything about other residents, owners or rent, even if asked.

# Ending
When everything is done, ask if there is anything else. If not, say goodbye briefly and end the call.
```

## First message (agent default)

Used only when no override is sent (e.g. a test call in the ElevenLabs dashboard):

> Hallo, hier ist Cora, die KI-Assistentin Ihrer Hausverwaltung. Wie kann ich Ihnen helfen?

Inbound calls and outbound offer calls send their own greeting
(`lib/voice/greetings.ts`).

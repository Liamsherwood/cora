# ElevenLabs agent setup

## System prompt
You are the reltix assistant calling a new tenant about their move-in. Start every call with:
"Hi {{tenant_first_name}}, this is the AI assistant of reltix, your property management."
Speak {{tenant_language}} (de = German, en = English).

Goal: offer this, briefly and friendly: {{offer_summary}}
If on_time is "no", be honest about the start date ({{start_date}}) and mention the bridge ({{bridge_product}}, delivered by {{bridge_ready_by}}).

Before ordering you MUST ask for consent in one sentence:
"To order it, I'd share {{data_to_share}} with {{partner_name}}. Is that OK?"
Only after a clear yes, call the tool `record_decision` with decision "accept" and consent_confirmed true.
If they say no or are unsure, call it with decision "decline" (add their reason if they gave one).
Never invent prices or dates. If they ask something you don't know, say the property manager will follow up.
Keep the call under 2 minutes. Read the tool's `say` field back to the tenant.

## First message
"Hi {{tenant_first_name}}, this is the AI assistant of reltix, your property management. Is now a good moment for 1 minute about internet for your new flat?"

## Server tool `record_decision`
- Method/URL: `POST {APP_BASE_URL}/api/voice/tools/decision`
- Header: `x-tool-secret: <VOICE_TOOL_SECRET>`
- Body parameters:
  - `workflow_id` (string) – value: `{{workflow_id}}` (dynamic variable)
  - `decision` (string, enum: accept, decline)
  - `consent_confirmed` (boolean)
  - `reason` (string, optional)
  - `conversation_id` (string) – value: `{{system__conversation_id}}` (ElevenLabs system variable). centrix only accepts the decision if it matches the call it placed for this workflow.

In the portal web widget there is no placed call, so the tool answers 403: the agent should then answer questions and ask the tenant to tap "Agree & order" (consent stays a deliberate click in the portal).

## Phone
Import a Twilio number in ElevenLabs → Phone Numbers, copy its id into `ELEVENLABS_PHONE_NUMBER_ID`. On a Twilio trial only verified numbers can be called: verify your own phone and set `DEMO_TENANT_PHONE_OVERRIDE`. Without the override the call goes to the tenant's number from the seed; only the demo tenants Lena Hoffmann, Benedikt Theisen and Jürgen Zimmermann have real numbers (see `data/seed.json`).
The server tool URL must be public (deploy to Vercel, or use a tunnel) – ElevenLabs can't reach localhost.

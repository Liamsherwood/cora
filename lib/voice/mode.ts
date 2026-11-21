/** How "Call tenant" reaches the tenant, decided by which ElevenLabs settings exist. */
export type VoiceMode = "phone" | "web" | "simulated"

/** Thread marker while the browser call rings in the tenant portal. */
export const WEB_RINGING = "web-ringing"

export function voiceMode(): VoiceMode {
  const key = process.env.ELEVENLABS_API_KEY
  const agent = process.env.ELEVENLABS_AGENT_ID
  if (key && agent && process.env.ELEVENLABS_PHONE_NUMBER_ID) return "phone"
  if (key && agent) return "web"
  return "simulated"
}

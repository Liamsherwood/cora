import type { DetailedHTMLProps, HTMLAttributes } from "react"

// <elevenlabs-convai> is a custom element registered by the ElevenLabs widget script.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        "agent-id"?: string
        "dynamic-variables"?: string
      }
    }
  }
}

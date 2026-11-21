import { z } from "zod"

export const ticketClassification = z.object({
  category: z.enum([
    "heating",
    "plumbing",
    "electrical",
    "internet",
    "damp_mould",
    "pests",
    "appliance",
    "elevator",
    "access_keys",
    "noise",
    "other",
  ]),
  priority: z.enum(["low", "normal", "high", "emergency"]),
  scope: z.enum(["unit", "common"]),
})

export type TicketClassification = z.infer<typeof ticketClassification>

export const classificationInstructions = `Classify the reported issue with these fields:
- Category: ${ticketClassification.shape.category.options.join(", ")}. Choose the closest match, or other.
- Priority: low for minor inconvenience, normal for standard repairs, high for significant disruption or likely damage, emergency for immediate danger or active severe damage.
- Scope: unit for a private residence, common for a shared area such as a lift, stairwell, basement, courtyard, roof or building entrance.
For immediate danger in Germany, tell the resident to call 112. For a smell of gas, tell them to leave without using switches or flames and call 112 from outside. Give safety guidance immediately.`

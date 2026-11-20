import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { SHAREABLE_FIELDS } from "@/connectors/spec";
import { acceptOffer } from "@/workflow/engine";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    channel: z.enum(["portal", "email", "whatsapp"]).default("portal"),
    consent: z.literal(true, { message: "explicit consent is required" }),
    fields: z.array(z.enum(SHAREABLE_FIELDS)).optional(),
  })
  .strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async (db) => {
    const b = await parseBody(req, Body);
    return acceptOffer(db, id, { channel: b.channel, fields: b.fields });
  });
}

import { z } from "zod";

export const MessagesSchema = z.array(z.strictObject({
  role: z.enum(["system", "user", "assistant"]), content: z.string().min(1),
})).min(1);
export const UsageSchema = z.object({ prompt_tokens: z.int().nonnegative(), completion_tokens: z.int().nonnegative() });
export const CompletionSchema = z.object({ text: z.string(), usage: UsageSchema.optional() });

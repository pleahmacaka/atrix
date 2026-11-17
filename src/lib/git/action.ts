import { z } from "zod"

export const gitAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("status") }),
  z.object({ kind: z.literal("diff"), file: z.string(), staged: z.boolean() }),
  z.object({ kind: z.literal("untracked"), file: z.string() }),
  z.object({ kind: z.literal("stage"), files: z.array(z.string()) }),
  z.object({ kind: z.literal("unstage"), files: z.array(z.string()) }),
  z.object({ kind: z.literal("commit"), message: z.string() }),
  z.object({ kind: z.literal("pull") }),
  z.object({ kind: z.literal("push") }),
])

export type GitAction = z.infer<typeof gitAction>

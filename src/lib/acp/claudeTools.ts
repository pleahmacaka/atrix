import { z } from "zod"

const SUBAGENT_TOOLS = new Set(["Agent", "Task"])

const toolMeta = z.object({ claudeCode: z.object({ toolName: z.string() }) })

export const startsSubagent = (meta: unknown) => {
  const parsed = toolMeta.safeParse(meta)

  return parsed.success && SUBAGENT_TOOLS.has(parsed.data.claudeCode.toolName)
}

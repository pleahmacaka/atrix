import type { UIMessage } from "ai"
import { z } from "zod"
import { block, SHOW_UI } from "../blocks.ts"

export const showUiInput = z.object({
  blocks: z.array(block).min(1).max(6).describe("Blocks shown top to bottom."),
})

const showUiPart = z.object({
  type: z.literal(`tool-${SHOW_UI}`),
  state: z.enum(["input-available", "output-available"]),
  input: showUiInput,
})

export const uiBlocksIn = (input: unknown) => {
  const parsed = showUiInput.safeParse(input)

  return parsed.success ? parsed.data.blocks : null
}

export const blocksOf = (part: UIMessage["parts"][number]) => {
  const parsed = showUiPart.safeParse(part)

  return parsed.success ? parsed.data.input.blocks : null
}

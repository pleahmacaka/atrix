import { generateText } from "ai"
import { m } from "#lib/paraglide/messages.js"
import { activeGateways, providerFor } from "#lib/store/gateways.svelte.ts"

const INSTRUCTIONS = [
  "You merge two concurrent edits of one markdown document.",
  "Keep every change from both edits. When they touch the same lines, combine them so neither intent is lost.",
  "Reply with the merged markdown only, without code fences or commentary.",
].join(" ")

export const mergeWithAi = async (
  base: string,
  mine: string,
  theirs: string,
) => {
  const [gateway] = activeGateways()

  if (!gateway) {
    throw new Error(m.chat_gateway_missing())
  }

  const { text } = await generateText({
    model: providerFor(gateway)(gateway.model),
    system: INSTRUCTIONS,
    prompt: `<original>\n${base}\n</original>\n<edit-a>\n${mine}\n</edit-a>\n<edit-b>\n${theirs}\n</edit-b>`,
  })

  return text
}

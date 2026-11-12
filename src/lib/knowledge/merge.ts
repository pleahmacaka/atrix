import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText } from "ai"
import { DEFAULT_MODEL } from "#lib/chat/chats.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { local } from "#lib/store/local.svelte.ts"

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
  const key = local.data.openrouter.key

  if (!key) {
    throw new Error(m.chat_openrouter_missing())
  }

  const provider = createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: key,
    headers: { "X-Title": "Atrix" },
  })
  const { text } = await generateText({
    model: provider(DEFAULT_MODEL),
    system: INSTRUCTIONS,
    prompt: `<original>\n${base}\n</original>\n<edit-a>\n${mine}\n</edit-a>\n<edit-b>\n${theirs}\n</edit-b>`,
  })

  return text
}

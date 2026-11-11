import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { Chat } from "@ai-sdk/svelte"
import {
  type ChatTransport,
  DirectChatTransport,
  type InferUITools,
  ToolLoopAgent,
  tool,
  type UIMessage,
} from "ai"
import { m } from "#lib/paraglide/messages.js"
import { local, type StoredChat } from "#lib/store/local.svelte.ts"
import { markUnread } from "#lib/store/unread.svelte.ts"
import { SHOW_UI, showUiInput, UI_INSTRUCTIONS } from "./blocks.ts"
import { titleOf } from "./chats.svelte.ts"

const API = "https://openrouter.ai/api/v1"

const showUi = tool({
  description:
    "Show structured content to the user: card, keyvalue, table, list, bar chart, image, link buttons or a 3D scene of primitive shapes. Text only, never HTML or scripts.",
  inputSchema: showUiInput,
  execute: async ({ blocks }) => ({ shown: blocks.length }),
})

const TOOLS = { [SHOW_UI]: showUi }

export type ChatMessage = UIMessage<unknown, never, InferUITools<typeof TOOLS>>

const agentFor = (model: string) => {
  const key = local.data.openrouter.key

  if (!key) {
    throw new Error(m.chat_openrouter_missing())
  }

  const provider = createOpenAICompatible({
    name: "openrouter",
    baseURL: API,
    apiKey: key,
    headers: { "X-Title": "Atrix" },
  })

  return new ToolLoopAgent({
    model: provider(model),
    instructions: UI_INSTRUCTIONS,
    tools: TOOLS,
  })
}

const transportFor = (stored: StoredChat): ChatTransport<ChatMessage> => ({
  sendMessages: options =>
    new DirectChatTransport({ agent: agentFor(stored.model) }).sendMessages(
      options,
    ),
  reconnectToStream: async () => null,
})

let models: Promise<string[]> | null = null

export const modelIds = () => {
  models ??= fetch(`${API}/models`)
    .then(r => r.json())
    .then((body: { data: { id: string }[] }) => body.data.map(m => m.id))
    .catch(() => {
      models = null

      return []
    })

  return models
}

const live = new WeakMap<StoredChat, Chat<ChatMessage>>()

export const chatFor = (stored: StoredChat) => {
  const known = live.get(stored)

  if (known) {
    return known
  }

  const chat: Chat<ChatMessage> = new Chat<ChatMessage>({
    id: stored.id,
    messages: $state.snapshot(stored.messages) as ChatMessage[],
    transport: transportFor(stored),
    onFinish: () => {
      stored.messages = chat.messages
      stored.title = titleOf(chat.messages)
      stored.at = Date.now()
      local.save()
      markUnread(stored.id)
    },
  })

  live.set(stored, chat)

  return chat
}

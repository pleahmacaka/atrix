import { Chat } from "@ai-sdk/svelte"
import {
  type ChatStatus,
  type ChatTransport,
  DirectChatTransport,
  type FileUIPart,
  ToolLoopAgent,
  type UIMessage,
} from "ai"
import { z } from "zod"
import { m } from "#lib/paraglide/messages.js"
import { findGateway, OPENROUTER_ID } from "#lib/store/gatewayCatalog.ts"
import { modelIdsOf, providerFor } from "#lib/store/gateways.svelte.ts"
import { local, type StoredChat } from "#lib/store/local.svelte.ts"
import { markUnread } from "#lib/store/unread.svelte.ts"
import { UI_INSTRUCTIONS } from "./blocks.ts"
import { titleOf } from "./chats.svelte.ts"

import { type ChatMessage, TOOLS } from "./tools.ts"

export type { ChatMessage } from "./tools.ts"

export type ChatLike = {
  messages: ChatMessage[]
  status: ChatStatus
  error: Error | undefined
  sendMessage: (message: {
    text: string
    files?: FileUIPart[]
  }) => Promise<void>
  stop: () => Promise<void>
}

const paced = z.object({
  pace: z.object({ tokens: z.number(), ms: z.number() }),
})

export const gatewayOf = (stored: StoredChat) =>
  findGateway(stored.gateway ?? OPENROUTER_ID)

export const paceOf = (message: UIMessage) => {
  const parsed = paced.safeParse(message.metadata)

  return parsed.success ? parsed.data.pace : undefined
}

const agentFor = (stored: StoredChat) => {
  const gateway = gatewayOf(stored)

  if (!gateway) {
    throw new Error(m.chat_gateway_missing())
  }

  return new ToolLoopAgent({
    model: providerFor(gateway)(stored.model),
    tools: TOOLS,
    instructions: [stored.instructions, UI_INSTRUCTIONS]
      .filter(Boolean)
      .join("\n\n"),
  })
}

const withoutReasoning = (messages: ChatMessage[]) =>
  messages.map(message =>
    message.role === "assistant"
      ? { ...message, parts: message.parts.filter(p => p.type !== "reasoning") }
      : message,
  )

const transportFor = (stored: StoredChat): ChatTransport<ChatMessage> => ({
  sendMessages: options => {
    let start = Date.now()

    return new DirectChatTransport<never, typeof TOOLS>({
      agent: agentFor(stored),
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          start = Date.now()
        }

        if (part.type === "finish" && part.totalUsage.outputTokens) {
          return {
            pace: {
              tokens: part.totalUsage.outputTokens,
              ms: Date.now() - start,
            },
          }
        }

        return undefined
      },
    }).sendMessages({
      ...options,
      messages: withoutReasoning(options.messages),
    })
  },
  reconnectToStream: async () => null,
})

export const modelIds = async (gatewayId: string) => {
  const gateway = findGateway(gatewayId)

  if (!gateway) {
    return []
  }

  const ids = await modelIdsOf(gateway)
  const listed = gateway.models

  return listed ? ids.filter(id => listed.includes(id)) : ids
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

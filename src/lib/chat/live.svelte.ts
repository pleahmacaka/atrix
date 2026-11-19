import { Chat } from "@ai-sdk/svelte"
import {
  type ChatStatus,
  type ChatTransport,
  DirectChatTransport,
  type FileUIPart,
  type InferUITools,
  ToolLoopAgent,
  tool,
  type UIMessage,
} from "ai"
import { z } from "zod"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { findGateway, OPENROUTER_ID } from "#lib/store/gatewayCatalog.ts"
import { modelIdsOf, providerFor } from "#lib/store/gateways.svelte.ts"
import { local, type StoredChat } from "#lib/store/local.svelte.ts"
import { markUnread } from "#lib/store/unread.svelte.ts"
import { SHOW_UI, showUiInput, UI_INSTRUCTIONS } from "./blocks.ts"
import { titleOf } from "./chats.svelte.ts"

const showUi = tool({
  description:
    "Show structured content to the user: card, keyvalue, table, list, bar chart, image, link buttons or a 3D scene of primitive shapes. Text only, never HTML or scripts.",
  inputSchema: showUiInput,
  execute: async ({ blocks }) => ({ shown: blocks.length }),
})

const knowledgeHosts = () => {
  const hosts = hostList()

  if (hosts.length === 0) {
    throw new Error(m.error_host_missing())
  }

  return hosts
}

const kgList = tool({
  description:
    "List the user's shared knowledge documents across connected devices with host, id, path, title and tags.",
  inputSchema: z.object({ prefix: z.string().optional() }),
  execute: async ({ prefix = "" }) => {
    const lists = await Promise.allSettled(
      knowledgeHosts().map(async h => {
        const entries = await h.view.call({ op: "kg.list" })

        return entries
          .filter(e => e.key.startsWith(prefix))
          .map(e => ({
            host: h.id,
            device: h.name,
            id: e.meta.id,
            path: e.key,
            title: e.meta.title,
            tags: e.meta.tags,
          }))
      }),
    )

    return lists.flatMap(l => (l.status === "fulfilled" ? l.value : []))
  },
})

const kgRead = tool({
  description:
    "Read one knowledge document by id or path: frontmatter and markdown body.",
  inputSchema: z.object({
    ref: z.string().describe("Document id or path"),
    host: z.string().optional().describe("host from kg_list"),
  }),
  execute: async ({ ref, host }) => {
    const hosts = knowledgeHosts().filter(h => !host || h.id === host)
    let failure: unknown = new Error(m.error_host_missing())

    for (const h of hosts) {
      try {
        const { key, meta, body } = await h.view.readDoc(ref)

        return { device: h.name, path: key, frontmatter: meta, body }
      } catch (e) {
        failure = e
      }
    }

    throw failure
  },
})

const TOOLS = { [SHOW_UI]: showUi, kg_list: kgList, kg_read: kgRead }

export type ChatMessage = UIMessage<unknown, never, InferUITools<typeof TOOLS>>

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

export const paceOf = (message: UIMessage) => {
  const parsed = paced.safeParse(message.metadata)

  return parsed.success ? parsed.data.pace : undefined
}

export const gatewayOf = (stored: StoredChat) =>
  findGateway(stored.gateway ?? OPENROUTER_ID)

const agentFor = (stored: StoredChat) => {
  const gateway = gatewayOf(stored)

  if (!gateway) {
    throw new Error(m.chat_gateway_missing())
  }

  return new ToolLoopAgent({
    model: providerFor(gateway)(stored.model),
    instructions: [stored.instructions, UI_INSTRUCTIONS]
      .filter(Boolean)
      .join("\n\n"),
    tools: TOOLS,
  })
}

// providers like Mistral reject the reasoning_content field that replayed reasoning becomes
const withoutReasoning = (messages: ChatMessage[]) =>
  messages.map(message =>
    message.role === "assistant"
      ? { ...message, parts: message.parts.filter(p => p.type !== "reasoning") }
      : message,
  )

const transportFor = (stored: StoredChat): ChatTransport<ChatMessage> => ({
  sendMessages: options => {
    let start = Date.now()

    return new DirectChatTransport({
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
  const enabled = gateway.models

  return enabled ? ids.filter(id => enabled.includes(id)) : ids
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

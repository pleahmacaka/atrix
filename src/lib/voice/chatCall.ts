import type { UIMessage } from "ai"
import type { ChatItem } from "#lib/acp/items.ts"
import { chats } from "#lib/chat/chats.svelte.ts"
import { chatFor, paceOf } from "#lib/chat/live.svelte.ts"
import type { SessionView } from "#lib/p2p/protocol.ts"
import type { StoredChat } from "#lib/store/local.svelte.ts"

export const CHAT_HOST = "chat"

const textOf = (message: UIMessage) =>
  message.parts.flatMap(p => (p.type === "text" ? [p.text] : [])).join("\n\n")

export const chatView = (stored: StoredChat): SessionView => {
  const chat = chatFor(stored)

  return {
    id: stored.id,
    harness: stored.model,
    cwd: "",
    title: stored.title,
    running: chat.status === "submitted" || chat.status === "streaming",
    items: chat.messages.map(
      (message): ChatItem => ({
        type: message.role === "user" ? "user" : "agent",
        id: message.id,
        text: textOf(message),
        pace: paceOf(message),
      }),
    ),
    ask: null,
    config: [],
  }
}

export const chatViewOf = (id: string) => {
  const stored = chats.find(id)

  return stored ? chatView(stored) : undefined
}

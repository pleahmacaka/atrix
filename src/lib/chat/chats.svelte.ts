import type { UIMessage } from "ai"
import { m } from "#lib/paraglide/messages.js"
import { local } from "#lib/store/local.svelte.ts"

export const DEFAULT_MODEL = "openrouter/auto"

const TITLE_LIMIT = 60

export const titleOf = (messages: UIMessage[]) => {
  const first = messages
    .find(m => m.role === "user")
    ?.parts.find(p => p.type === "text")

  return first?.type === "text"
    ? first.text.slice(0, TITLE_LIMIT)
    : m.chat_new_title()
}

class Chats {
  get list() {
    return local.data.chats.toSorted((a, b) => b.at - a.at)
  }

  remove = async (id: string) => {
    local.data.chats = local.data.chats.filter(c => c.id !== id)
    await local.save()
  }

  find = (id: string) => local.data.chats.find(c => c.id === id)

  create = (model: string) => {
    const id = crypto.randomUUID()

    local.data.chats.push({
      id,
      title: m.chat_new_title(),
      model,
      messages: [],
      at: Date.now(),
    })

    return id
  }
}

export const chats = new Chats()

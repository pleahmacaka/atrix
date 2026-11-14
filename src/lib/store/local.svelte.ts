import { get, set } from "idb-keyval"
import type { ChatMessage } from "#lib/chat/live.svelte.ts"

const STORE = "atrix"

export type Gateway = {
  id: string
  name: string
  kind: "openrouter" | "openai"
  baseURL: string
  key: string | null
  model: string
  at: number
  removed?: boolean
}

type Legacy = { openrouter?: { key: string | null; at: number } }

export type StoredChat = {
  id: string
  title: string
  gateway?: string
  model: string
  messages: ChatMessage[]
  at: number
}

export type Contents = {
  gateways: Gateway[]
  sync: string | null
  chats: StoredChat[]
}

const EMPTY: Contents = {
  gateways: [],
  sync: null,
  chats: [],
}

class Local {
  ready = $state(false)

  data = $state<Contents>(structuredClone(EMPTY))

  load = async () => {
    const { openrouter, ...stored } =
      (await get<Partial<Contents> & Legacy>(STORE)) ?? {}

    this.data = { ...structuredClone(EMPTY), ...stored }

    if (openrouter?.key && this.data.gateways.length === 0) {
      this.data.gateways.push({
        id: "openrouter",
        name: "OpenRouter",
        kind: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        key: openrouter.key,
        model: "openrouter/auto",
        at: openrouter.at,
      })
    }

    this.ready = true
  }

  save = () => set(STORE, $state.snapshot(this.data))
}

export const local = new Local()

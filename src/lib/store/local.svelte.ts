import { get, set } from "idb-keyval"
import { z } from "zod"
import type { ChatMessage } from "#lib/chat/live.svelte.ts"
import type { Peer } from "#lib/p2p/net.ts"

const STORE = "atrix"

export const gateway = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["openrouter", "openai"]),
  baseURL: z.string(),
  key: z.string().nullable(),
  model: z.string(),
  at: z.number(),
  removed: z.boolean().optional(),
})

export type Gateway = z.infer<typeof gateway>

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
  net?: { key?: string; peers: Peer[] }
  chats: StoredChat[]
}

const EMPTY: Contents = {
  gateways: [],
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

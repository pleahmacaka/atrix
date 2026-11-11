import { get, set } from "idb-keyval"
import type { ChatMessage } from "#lib/chat/live.svelte.ts"

const STORE = "atrix"

export type Credential = { key: string | null; at: number }

export type StoredChat = {
  id: string
  title: string
  model: string
  messages: ChatMessage[]
  at: number
}

export type Contents = {
  openrouter: Credential
  sync: string | null
  chats: StoredChat[]
}

const EMPTY: Contents = {
  openrouter: { key: null, at: 0 },
  sync: null,
  chats: [],
}

class Local {
  ready = $state(false)

  data = $state<Contents>(structuredClone(EMPTY))

  load = async () => {
    this.data = { ...structuredClone(EMPTY), ...(await get<Contents>(STORE)) }
    this.ready = true
  }

  save = () => set(STORE, $state.snapshot(this.data))
}

export const local = new Local()

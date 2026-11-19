import { get, set } from "idb-keyval"
import { z } from "zod"
import type { ChatMessage } from "#lib/chat/live.svelte.ts"
import type { Peer } from "#lib/p2p/net.ts"
import type { LockSecret } from "#lib/p2p/protocol.ts"

const STORE = "atrix"

export const gateway = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["openrouter", "openai"]),
  baseURL: z.string(),
  key: z.string().nullable(),
  model: z.string(),
  models: z.array(z.string()).optional(),
  at: z.number(),
  removed: z.boolean().optional(),
})

export type Gateway = z.infer<typeof gateway>

type Legacy = { openrouter?: { key: string | null; at: number } }

export type StoredChat = {
  id: string
  title: string
  gateway?: string
  instructions?: string
  model: string
  messages: ChatMessage[]
  at: number
}

export type SpeechRole = "stt" | "tts"

export type SpeechProvider = {
  id: string
  role: SpeechRole
  kind: "atrix" | "openai"
  name: string
  baseURL: string
  key: string | null
  model: string
  voice: string
  at: number
  removed?: boolean
}

export type GroupMember = {
  host: string
  id: string
  from: number
  offset: number
  role?: "worker" | "reviewer"
  label?: string
  agent?: string
  invited?: boolean
}

export type StoredReply = { member: string; name: string; text: string }

export type GroupMessage = {
  id: string
  text: string
  at: number
  targets?: string[]
  replies?: StoredReply[]
}

export type StoredGroup = {
  id: string
  title: string
  cwd?: string
  members: GroupMember[]
  messages: GroupMessage[]
  at: number
}

export type StoredAgent = {
  id: string
  name: string
  provider: string
  model: string
  effort: string
  instructions: string
  variables?: Record<string, string>
  requires?: Requires
  cwd: string
  at: number
}

export type Requires = { skills?: string[]; tools?: string[]; mcp?: string[] }

export type PartKind = "prompt" | "instruction" | "variable"

export type StoredPrompt = {
  id: string
  name: string
  kind?: PartKind
  text: string
  requires?: Requires
  at: number
}

export type StoredThread = {
  id: string
  host: string
  parent: string
  item: string
  session: string
  at: number
}

export type Contents = {
  gateways: Gateway[]
  lock?: LockSecret
  net?: { key?: string; peers: Peer[] }
  chats: StoredChat[]
  groups: StoredGroup[]
  speech: SpeechProvider[]
  threads: StoredThread[]
  agents: StoredAgent[]
  prompts: StoredPrompt[]
  speechActive?: Partial<Record<SpeechRole, string>>
}

const EMPTY: Contents = {
  gateways: [],
  chats: [],
  groups: [],
  speech: [],
  threads: [],
  agents: [],
  prompts: [],
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

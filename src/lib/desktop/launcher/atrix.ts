import { emitTo } from "@tauri-apps/api/event"
import type { Current } from "#lib/store/nav.svelte.ts"

export const ATRIX_REQUEST = "launcher:atrix"

export const ATRIX_ITEMS = "launcher:atrix-items"

export type AtrixConversation = {
  key: string
  current: NonNullable<Current>
  title: string
  source: string
  icon: string
  running: boolean
}

export type AtrixDoc = { id: string; title: string; tags: string[] }

export type AtrixItems = {
  conversations: AtrixConversation[]
  docs: AtrixDoc[]
}

export type AtrixRequest =
  | { kind: "list"; reply: string }
  | { kind: "open" }
  | { kind: "new"; prompt: string }
  | { kind: "conversation"; current: NonNullable<Current> }
  | { kind: "doc"; id: string }

export const askAtrix = (request: AtrixRequest) =>
  emitTo("main", ATRIX_REQUEST, request)

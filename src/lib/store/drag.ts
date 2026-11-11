import type { Current } from "./nav.svelte.ts"

const MIME = "application/x-atrix-conversation"

export const startDrag = (e: DragEvent, current: NonNullable<Current>) => {
  e.dataTransfer?.setData(MIME, JSON.stringify(current))
  e.dataTransfer?.setData("text/plain", "")

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "copyMove"
  }
}

export const isConversationDrag = (e: DragEvent) =>
  !!e.dataTransfer?.types.includes(MIME)

export const droppedConversation = (e: DragEvent): Current => {
  const raw = e.dataTransfer?.getData(MIME)

  return raw ? (JSON.parse(raw) as Current) : null
}

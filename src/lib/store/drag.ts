import type { Current } from "./nav.svelte.ts"

const MIME = "application/x-atrix-conversation"

export const startDrag = (e: DragEvent, current: NonNullable<Current>) => {
  e.dataTransfer?.setData(MIME, JSON.stringify(current))
  e.dataTransfer?.setData("text/plain", "")

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "copyMove"
  }
}

const NEW_MIME = "application/x-atrix-new-chat"

let floatNewChat: (() => void) | null = null

export const onNewChatFloat = (run: () => void) => {
  floatNewChat = run
}

const watchLooseDrop = () => {
  let outside = false

  const over = (e: DragEvent) => {
    outside = false

    if (!e.defaultPrevented && e.dataTransfer) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    }
  }

  const leave = (e: DragEvent) => {
    if (!e.relatedTarget) {
      outside = true
    }
  }

  const drop = (e: DragEvent) => {
    if (!e.defaultPrevented) {
      e.preventDefault()
      floatNewChat?.()
    }
  }

  const end = (e: DragEvent) => {
    if (outside && e.dataTransfer?.dropEffect === "none") {
      floatNewChat?.()
    }

    document.removeEventListener("dragover", over)
    document.removeEventListener("dragleave", leave)
    document.removeEventListener("drop", drop)
    document.removeEventListener("dragend", end)
  }

  document.addEventListener("dragover", over)
  document.addEventListener("dragleave", leave)
  document.addEventListener("drop", drop)
  document.addEventListener("dragend", end)
}

export const startNewChatDrag = (e: DragEvent) => {
  e.dataTransfer?.setData(NEW_MIME, "1")
  e.dataTransfer?.setData("text/plain", "")

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "copy"
  }

  if (floatNewChat) {
    watchLooseDrop()
  }
}

export const isNewChatDrag = (e: DragEvent) =>
  !!e.dataTransfer?.types.includes(NEW_MIME)

export const isConversationDrag = (e: DragEvent) =>
  !!e.dataTransfer?.types.includes(MIME)

export const droppedConversation = (e: DragEvent): Current => {
  const raw = e.dataTransfer?.getData(MIME)

  return raw ? (JSON.parse(raw) as Current) : null
}

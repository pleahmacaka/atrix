import type { Attachment } from "svelte/attachments"

export const menuKeys: Attachment<HTMLElement> = node => {
  const step = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
      return
    }

    e.preventDefault()

    const items = [
      ...node.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ]
    const focused = document.activeElement
    const at =
      focused instanceof HTMLButtonElement ? items.indexOf(focused) : -1
    const next = at + (e.key === "ArrowDown" ? 1 : -1)

    items[(next + items.length) % items.length]?.focus({ preventScroll: true })
  }

  node.addEventListener("keydown", step)

  return () => node.removeEventListener("keydown", step)
}

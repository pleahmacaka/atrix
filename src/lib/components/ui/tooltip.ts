import type { Attachment } from "svelte/attachments"

const GAP_REM = 0.5

let tip: HTMLDivElement | null = null

const tipOf = () => {
  if (!tip) {
    tip = document.createElement("div")
    tip.popover = "manual"
    tip.className = [
      "pointer-events-none fixed inset-auto m-0 max-w-72 flex-col gap-0.5 open:flex",
      "rounded-box border border-base-300 bg-raised px-3 py-2 text-xs shadow-md",
    ].join(" ")
    document.body.append(tip)
  }

  return tip
}

const remOf = (px: number) =>
  px / Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

export const tooltip =
  (
    text: () => string | string[],
    enabled: () => boolean = () => true,
  ): Attachment<HTMLElement> =>
  node => {
    const show = () => {
      const value = text()
      const lines = (Array.isArray(value) ? value : [value]).filter(Boolean)

      if (!enabled() || lines.length === 0) {
        return
      }

      const el = tipOf()
      const box = node.getBoundingClientRect()

      el.replaceChildren(
        ...lines.map((line, i) => {
          const span = document.createElement("span")

          span.textContent = line
          span.className =
            i === 0
              ? "break-words text-sm font-medium"
              : "break-words text-base-content/60"

          return span
        }),
      )
      el.style.left = `${remOf(box.right) + GAP_REM}rem`
      el.style.top = `${remOf(box.top + box.height / 2)}rem`
      el.style.translate = "0 -50%"
      el.showPopover()
    }

    const hide = () => {
      if (tip?.matches(":popover-open")) {
        tip.hidePopover()
      }
    }

    node.addEventListener("pointerenter", show)
    node.addEventListener("pointerleave", hide)
    node.addEventListener("focus", show)
    node.addEventListener("blur", hide)
    node.addEventListener("pointerdown", hide)

    return () => {
      hide()
      node.removeEventListener("pointerenter", show)
      node.removeEventListener("pointerleave", hide)
      node.removeEventListener("focus", show)
      node.removeEventListener("blur", hide)
      node.removeEventListener("pointerdown", hide)
    }
  }

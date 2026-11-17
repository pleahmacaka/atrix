import {
  computePosition,
  flip,
  offset,
  type Placement,
  shift,
} from "@floating-ui/dom"
import type { Attachment } from "svelte/attachments"

const GAP_REM = 0.5

const EDGE_REM = 0.5

const DELAY_MS = 400

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

const rootRem = () =>
  Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

const fill = (el: HTMLDivElement, lines: string[]) =>
  el.replaceChildren(
    ...lines.map((line, i) => {
      const span = document.createElement("span")

      span.textContent = line
      span.className =
        lines.length > 1 && i === 0
          ? "break-words text-sm font-medium"
          : i === 0
            ? "break-words"
            : "break-words text-base-content/60"

      return span
    }),
  )

const open = async (
  node: HTMLElement,
  lines: string[],
  placement: Placement,
) => {
  const el = tipOf()
  const rem = rootRem()

  fill(el, lines)
  el.showPopover()

  const { x, y } = await computePosition(node, el, {
    placement,
    strategy: "fixed",
    middleware: [
      offset(GAP_REM * rem),
      flip({ padding: EDGE_REM * rem }),
      shift({ padding: EDGE_REM * rem }),
    ],
  })

  el.style.left = `${x / rem}rem`
  el.style.top = `${y / rem}rem`
}

const close = () => {
  if (tip?.matches(":popover-open")) {
    tip.hidePopover()
  }
}

export const tooltip =
  (
    text: () => string | string[],
    enabled: () => boolean = () => true,
  ): Attachment<HTMLElement> =>
  node => {
    const show = () => {
      const value = text()
      const lines = (Array.isArray(value) ? value : [value]).filter(Boolean)

      if (enabled() && lines.length > 0) {
        open(node, lines, "right")
      }
    }

    node.addEventListener("pointerenter", show)
    node.addEventListener("pointerleave", close)
    node.addEventListener("focus", show)
    node.addEventListener("blur", close)
    node.addEventListener("pointerdown", close)

    return () => {
      close()
      node.removeEventListener("pointerenter", show)
      node.removeEventListener("pointerleave", close)
      node.removeEventListener("focus", show)
      node.removeEventListener("blur", close)
      node.removeEventListener("pointerdown", close)
    }
  }

export const startTitleTips = () => {
  let owner: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const hide = () => {
    clearTimeout(timer)
    close()
  }

  const over = (e: PointerEvent) => {
    const el =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>("[title], [data-tip]")
        : null

    if (el?.hasAttribute("title")) {
      el.dataset.tip = el.title
      el.removeAttribute("title")
    }

    if (!el || el === owner) {
      return
    }

    hide()
    owner = el

    const text = el.dataset.tip

    if (text) {
      timer = setTimeout(() => open(el, [text], "bottom"), DELAY_MS)
    }
  }

  const out = (e: PointerEvent) => {
    const inside =
      e.relatedTarget instanceof Node && owner?.contains(e.relatedTarget)

    if (owner && !inside) {
      owner = null
      hide()
    }
  }

  document.addEventListener("pointerover", over)
  document.addEventListener("pointerout", out)
  document.addEventListener("pointerdown", hide, true)
  document.addEventListener("scroll", hide, true)

  return () => {
    hide()
    document.removeEventListener("pointerover", over)
    document.removeEventListener("pointerout", out)
    document.removeEventListener("pointerdown", hide, true)
    document.removeEventListener("scroll", hide, true)
  }
}

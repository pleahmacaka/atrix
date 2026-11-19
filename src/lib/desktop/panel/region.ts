import type { Attachment } from "svelte/attachments"
import { setWindowRegion } from "#lib/desktop/native/windows.ts"
import { logFailure } from "#lib/logging.ts"

const OVERLAY = ":popover-open, dialog[open]"

const rectOf = (node: Element): [number, number, number, number] => {
  const r = node.getBoundingClientRect()

  return [
    Math.floor(r.left),
    Math.floor(r.top),
    Math.ceil(r.right),
    Math.ceil(r.bottom),
  ]
}

export const overlayOpen = () => document.querySelector(OVERLAY) !== null

export const windowRegion: Attachment<HTMLElement> = node => {
  let last = ""

  const fit = () => {
    const rects = overlayOpen() ? null : [rectOf(node)]
    const key = JSON.stringify(rects)

    if (key !== last) {
      last = key
      setWindowRegion(rects).catch(e => logFailure("panel region", e))
    }
  }

  const resized = new ResizeObserver(fit)
  const moved = new MutationObserver(fit)
  const opened = new MutationObserver(fit)

  resized.observe(node)
  moved.observe(node, { attributes: true, attributeFilter: ["class"] })
  opened.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  })
  document.addEventListener("toggle", fit, true)
  fit()

  return () => {
    resized.disconnect()
    moved.disconnect()
    opened.disconnect()
    document.removeEventListener("toggle", fit, true)
  }
}

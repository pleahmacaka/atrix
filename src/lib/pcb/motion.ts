import { tick } from "svelte"
import { flip } from "svelte/animate"
import { cubicOut } from "svelte/easing"
import { prefersReducedMotion } from "svelte/motion"
import { draw, fly, scale, slide, fade as svelteFade } from "svelte/transition"

const MICRO = 140

const time = () => (prefersReducedMotion.current ? 0 : MICRO)

export const fade = (node: Element) =>
  svelteFade(node, { duration: time(), easing: cubicOut })

export const rise = (node: Element) =>
  fly(node, { y: "0.25rem", duration: time(), easing: cubicOut })

const EDGE_MS = MICRO * 1.5

export const edge = (node: Element) =>
  fly(node, {
    x: "-100%",
    opacity: 1,
    duration: time() && EDGE_MS,
    easing: cubicOut,
  })

export const mirror = (_node: Element) => ({
  duration: time() && EDGE_MS,
  easing: cubicOut,
  css: (t: number) => `scale: ${1 - 2 * t} 1`,
})

export const reveal = (node: Element) =>
  slide(node, { duration: time(), easing: cubicOut })

export const reorder = (node: Element, rects: { from: DOMRect; to: DOMRect }) =>
  flip(node, rects, { duration: time(), easing: cubicOut })

export const pop = (node: Element, { delay = 0 } = {}) =>
  scale(node, {
    start: 0.92,
    duration: time(),
    delay: time() && delay,
    easing: cubicOut,
  })

export const trace = (
  node: SVGElement & { getTotalLength(): number },
  { delay = 0 } = {},
) => draw(node, { duration: time(), delay: time() && delay, easing: cubicOut })

export const morph = async (update: () => unknown) => {
  if (prefersReducedMotion.current || !("startViewTransition" in document)) {
    await update()

    return
  }

  await document.startViewTransition(async () => {
    await update()
    await tick()
  }).updateCallbackDone
}

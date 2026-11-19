import { flushSync } from "svelte"
import type { Attachment } from "svelte/attachments"
import { reducedMotion } from "#lib/desktop/motion.ts"
import { setWindowRegion } from "#lib/desktop/native/windows.ts"
import { logFailure } from "#lib/logging.ts"

const FULL_CLIP = "inset(0 round var(--radius-box))"

const SETTLE_FALLBACK_MS = 400

type Rect = [number, number, number, number]

const rootRem = () =>
  Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

// enter and exit animations slide cards with transform, so the region tracks where a card comes to rest
const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect()
  const { m41: x, m42: y } = new DOMMatrixReadOnly(
    getComputedStyle(el).transform,
  )

  return [
    Math.floor(r.left - x),
    Math.floor(r.top - y),
    Math.ceil(r.right - x),
    Math.ceil(r.bottom - y),
  ]
}

const overlayRects = () =>
  [...document.querySelectorAll(":popover-open")].map(el => {
    const r = el.getBoundingClientRect()

    return [
      Math.floor(r.left),
      Math.floor(r.top),
      Math.ceil(r.right),
      Math.ceil(r.bottom),
    ] satisfies Rect
  })

export class Morph {
  expanded = $state(false)

  snapping = $state(false)

  clip = $state(FULL_CLIP)

  clipPath = $derived(this.expanded ? FULL_CLIP : this.clip)

  #moving = false

  #settleTimer: ReturnType<typeof setTimeout> | undefined

  #compact = new Set<Element>()

  #full = new Set<Element>()

  #month: Element | null = null

  #region = ""

  #surface =
    (cards: Set<Element>): Attachment =>
    node => {
      const observer = new ResizeObserver(this.fit)
      const moved = (e: Event) => e.target === node && this.fit()

      cards.add(node)
      observer.observe(node)
      node.addEventListener("transitionend", moved)

      return () => {
        observer.disconnect()
        node.removeEventListener("transitionend", moved)
        cards.delete(node)
        this.fit()
      }
    }

  card = this.#surface(this.#compact)

  fullCard = this.#surface(this.#full)

  monthCard: Attachment = node => {
    this.#month = node

    return () => {
      if (this.#month === node) {
        this.#month = null
      }
    }
  }

  overlays: Attachment = () => {
    const toggled = () => this.fit()

    document.addEventListener("toggle", toggled, true)

    return () => document.removeEventListener("toggle", toggled, true)
  }

  #monthClip = () => {
    if (!this.#month) {
      return FULL_CLIP
    }

    const rem = rootRem()
    const [left, top, right, bottom] = rectOf(this.#month).map(v => v / rem)
    const inset = [
      top,
      innerWidth / rem - right,
      innerHeight / rem - bottom,
      left,
    ]

    return `inset(${inset.map(v => `${v}rem`).join(" ")} round var(--radius-box))`
  }

  // the window region also clips painting, so it must cover both layouts while one morphs into the other
  fit = () => {
    if (!this.expanded) {
      this.clip = this.#monthClip()
    }

    const cards = this.#moving
      ? [...this.#compact, ...this.#full]
      : [...(this.expanded ? this.#full : this.#compact)]

    const rects = [...cards.map(rectOf), ...overlayRects()]
    const region = JSON.stringify(rects)

    if (rects.length > 0 && region !== this.#region) {
      this.#region = region
      setWindowRegion(rects).catch(e => logFailure("panel region", e))
    }
  }

  #settled = () => {
    clearTimeout(this.#settleTimer)
    this.#moving = false
    this.fit()
  }

  #move = (expanded: boolean) => {
    if (this.expanded === expanded) {
      return
    }

    this.clip = this.#monthClip()
    this.#moving = !reducedMotion()
    this.expanded = expanded
    this.fit()

    if (this.#moving) {
      clearTimeout(this.#settleTimer)
      this.#settleTimer = setTimeout(this.#settled, SETTLE_FALLBACK_MS)
    }
  }

  expand = () => this.#move(true)

  collapse = () => this.#move(false)

  settle = (e: TransitionEvent) => {
    if (e.target === e.currentTarget && e.propertyName === "clip-path") {
      this.#settled()
    }
  }

  snap = (expanded: boolean, apply: () => void = () => undefined) => {
    flushSync(() => {
      this.snapping = true
      apply()
      this.expanded = expanded
    })
    document.documentElement.getBoundingClientRect()
    this.snapping = false
    this.#settled()
  }
}

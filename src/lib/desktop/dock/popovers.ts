import type { MenuBox } from "./layout.svelte"

type Claim = (key: string, rect: MenuBox | null) => void

const frames = (run: () => void) =>
  requestAnimationFrame(() => requestAnimationFrame(run))

// popovers open scaled, so the box comes from the untransformed size around the visual center
const boxOf = (node: HTMLElement): MenuBox => {
  const rect = node.getBoundingClientRect()
  const x = (rect.left + rect.right) / 2
  const y = (rect.top + rect.bottom) / 2
  const width = node.offsetWidth / 2
  const height = node.offsetHeight / 2

  return {
    left: x - width,
    top: y - height,
    right: x + width,
    bottom: y + height,
  }
}

export const watchPopovers = (claim: Claim) => {
  const watched = new Map<HTMLElement, ResizeObserver>()
  const keys = new WeakMap<HTMLElement, string>()
  let count = 0

  const keyOf = (node: HTMLElement) => {
    let key = keys.get(node)

    if (!key) {
      key = `popover-${++count}`
      keys.set(node, key)
    }

    return key
  }

  const measure = (node: HTMLElement) => {
    if (node.matches(":popover-open")) {
      claim(keyOf(node), boxOf(node))
    }
  }

  const toggled = (e: Event) => {
    const node = e.target

    if (!(node instanceof HTMLElement) || !(e instanceof ToggleEvent)) {
      return
    }

    if (e.newState === "open") {
      frames(() => measure(node))

      if (!watched.has(node)) {
        const observer = new ResizeObserver(() => measure(node))

        observer.observe(node)
        watched.set(node, observer)
      }

      return
    }

    watched.get(node)?.disconnect()
    watched.delete(node)
    claim(keyOf(node), null)
  }

  document.addEventListener("toggle", toggled, true)

  return () => {
    document.removeEventListener("toggle", toggled, true)

    for (const observer of watched.values()) {
      observer.disconnect()
    }
  }
}

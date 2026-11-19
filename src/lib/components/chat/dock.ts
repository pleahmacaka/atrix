const keepingFocus = (el: HTMLElement, move: () => void) => {
  const active = document.activeElement

  move()

  if (active instanceof HTMLElement && el.contains(active)) {
    active.focus()
  }
}

export const dock = (target: () => HTMLElement | null) => (el: HTMLElement) => {
  const slot = target()

  if (!slot) {
    return
  }

  const marker = document.createComment("")

  el.before(marker)
  keepingFocus(el, () => slot.append(el))

  return () => {
    if (marker.isConnected) {
      keepingFocus(el, () => marker.replaceWith(el))
    } else {
      el.remove()
    }
  }
}

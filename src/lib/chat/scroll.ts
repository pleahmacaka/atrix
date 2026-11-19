const NEAR_REM = 4

export const stickBottom = (scroller: HTMLElement) => {
  const near = () =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) *
    NEAR_REM

  let stuck = true

  const scrolled = () => {
    stuck = Math.abs(scroller.scrollTop) < near()
  }

  const grown = new ResizeObserver(() => {
    if (stuck) {
      scroller.scrollTop = 0
    }
  })

  for (const child of scroller.children) {
    grown.observe(child)
  }

  scroller.addEventListener("scroll", scrolled, { passive: true })

  return () => {
    grown.disconnect()
    scroller.removeEventListener("scroll", scrolled)
  }
}

export const pinToggles = (scroller: HTMLElement) => {
  let held: { summary: Element; top: number } | null = null

  const press = (e: Event) => {
    const summary =
      e.target instanceof Element ? e.target.closest("summary") : null

    held = summary
      ? { summary, top: summary.getBoundingClientRect().top }
      : null
  }

  const toggled = () => {
    if (held) {
      scroller.scrollTop += held.summary.getBoundingClientRect().top - held.top
      held = null
    }
  }

  scroller.addEventListener("click", press, true)
  scroller.addEventListener("toggle", toggled, true)

  return () => {
    scroller.removeEventListener("click", press, true)
    scroller.removeEventListener("toggle", toggled, true)
  }
}

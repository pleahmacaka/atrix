const FADE_MS = 120

export const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches

export const fadeShell = (el: HTMLElement, out: boolean) => {
  if (reducedMotion()) {
    return
  }

  for (const animation of el.getAnimations()) {
    animation.cancel()
  }

  el.animate([{ opacity: out ? 1 : 0 }, { opacity: out ? 0 : 1 }], {
    duration: FADE_MS,
    easing: out ? "ease-in" : "ease-out",
    fill: out ? "forwards" : "backwards",
  })
}

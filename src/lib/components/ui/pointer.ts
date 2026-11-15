export const trackPointer = (
  e: PointerEvent,
  move: (p: PointerEvent) => void,
) => {
  const handle = e.currentTarget

  if (!(handle instanceof HTMLElement)) {
    return
  }

  const stop = () => {
    handle.removeEventListener("pointermove", move)
    handle.removeEventListener("pointerup", stop)
  }

  handle.setPointerCapture(e.pointerId)
  handle.addEventListener("pointermove", move)
  handle.addEventListener("pointerup", stop)
}

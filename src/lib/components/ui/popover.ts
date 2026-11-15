export const popoverMotion = [
  "scale-95 opacity-0 transition transition-discrete duration-140",
  "pointer-events-none open:pointer-events-auto open:scale-100 open:opacity-100",
  "starting:open:scale-95 starting:open:opacity-0",
]

export const popoverSheet = [
  "popover-sheet max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:m-0",
  "max-sm:max-h-4/5 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none",
  "max-sm:border-x-0 max-sm:border-b-0 max-sm:translate-y-8 max-sm:scale-100",
  "max-sm:open:translate-y-0 max-sm:starting:open:translate-y-8",
  "max-sm:starting:open:scale-100 max-sm:backdrop:bg-black/40",
]

const scrolls = (box: HTMLElement) =>
  box.scrollHeight > box.clientHeight &&
  ["auto", "scroll"].includes(getComputedStyle(box).overflowY)

export const reveal = (el: HTMLElement | null) => {
  const root = el?.closest<HTMLElement>("[popover], dialog") ?? null
  let box = el?.parentElement

  while (box && box !== root && !scrolls(box)) {
    box = box.parentElement
  }

  if (!el || !box || !scrolls(box)) {
    return
  }

  const item = el.getBoundingClientRect()
  const frame = box.getBoundingClientRect()

  if (item.top < frame.top) {
    box.scrollTop -= frame.top - item.top
  } else if (item.bottom > frame.bottom) {
    box.scrollTop += item.bottom - frame.bottom
  }
}

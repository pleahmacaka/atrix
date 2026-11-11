import type { SheetBox, SheetLabel } from "../types.ts"

export type View = { scale: number; x: number; y: number }

export const MM = 96 / 25.4

export const findLabels = (labels: SheetLabel[], query: string) => {
  const q = query.trim().toLowerCase()

  if (!q) {
    return []
  }

  const exact = labels.filter(l => l.text.toLowerCase() === q)

  return exact.length > 0
    ? exact
    : labels.filter(l => l.text.toLowerCase().includes(q))
}

export const fitView = (
  sheet: { width: number; height: number },
  box: { width: number; height: number },
  pad: number,
): View => {
  const scale = Math.max(
    Math.min(
      (box.width - pad * 2) / sheet.width,
      (box.height - pad * 2) / sheet.height,
    ),
    0.01,
  )

  return {
    scale,
    x: (box.width - sheet.width * scale) / 2,
    y: (box.height - sheet.height * scale) / 2,
  }
}

export const zoomAt = (
  view: View,
  next: number,
  px: number,
  py: number,
): View => ({
  scale: next,
  x: px - ((px - view.x) * next) / view.scale,
  y: py - ((py - view.y) * next) / view.scale,
})

export const centerOn = (
  label: SheetBox,
  origin: { x: number; y: number },
  scale: number,
  box: { width: number; height: number },
): View => ({
  scale,
  x: box.width / 2 - (label.x + label.width / 2 - origin.x) * scale,
  y: box.height / 2 - (label.y + label.height / 2 - origin.y) * scale,
})

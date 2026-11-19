import { startDrag } from "#lib/store/drag.ts"
import type { Current } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"

export type Zone = "left" | "right" | "top" | "bottom" | "center"

const PANE_MIME = "application/x-atrix-pane"

const EDGE = 0.25

export const grabPane = (e: DragEvent, current: Current, id: string) => {
  if (!current) {
    return
  }

  startDrag(e, current)
  e.dataTransfer?.setData(PANE_MIME, id)
}

export const draggedPane = (e: DragEvent) =>
  e.dataTransfer?.getData(PANE_MIME) ?? ""

export const hasFiles = (e: DragEvent) =>
  !!e.dataTransfer?.types.includes("Files")

export const holds = (parent: Node | null, node: Node) =>
  !!parent && parent.contains(node)

export const zoneOf = (e: DragEvent, box: HTMLElement, id: string): Zone => {
  const rect = box.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  const edges = [
    ["left", x],
    ["right", 1 - x],
    ["top", y],
    ["bottom", 1 - y],
  ] as const
  const [side, distance] = edges.toSorted((p, q) => p[1] - q[1])[0]

  return distance < EDGE && panes.canSplit(id, side) ? side : "center"
}

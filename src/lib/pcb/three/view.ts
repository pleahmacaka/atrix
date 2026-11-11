import type { CameraControlsRef } from "@threlte/extras"
import { m } from "#lib/paraglide/messages.js"
import type { Box3, Pcb } from "../types.ts"

export type ViewPreset = "iso" | "top" | "bottom"

export const VIEWS: { id: ViewPreset; label: () => string }[] = [
  { id: "iso", label: m.pcb_3d_view_iso },
  { id: "top", label: m.pcb_3d_view_top },
  { id: "bottom", label: m.pcb_3d_view_bottom },
]

export const centerOf = ({ dims: { board } }: Pcb) => ({
  x: (board.min[0] + board.max[0]) / 2,
  y: (board.min[1] + board.max[1]) / 2,
})

export const spanOf = ({ dims: { board } }: Pcb) =>
  Math.max(board.max[0] - board.min[0], board.max[1] - board.min[1])

export const toWorld = (
  pcb: Pcb,
  x: number,
  y: number,
  z: number,
): [number, number, number] => {
  const c = centerOf(pcb)

  return [x - c.x, z, y - c.y]
}

export const boxInWorld = (pcb: Pcb, box: Box3) => {
  const min = toWorld(pcb, box.min[0], box.min[1], box.min[2])
  const max = toWorld(pcb, box.max[0], box.max[1], box.max[2])

  return {
    center: min.map((v, i) => (v + (max[i] ?? 0)) / 2) as [
      number,
      number,
      number,
    ],
    size: min.map((v, i) => Math.abs((max[i] ?? 0) - v)) as [
      number,
      number,
      number,
    ],
  }
}

export const look = (
  controls: CameraControlsRef,
  preset: ViewPreset,
  span: number,
  smooth = true,
) => {
  const camera = controls.camera
  const aspect = "aspect" in camera ? camera.aspect : 1
  const d = span * 1.6 * Math.max(1, 1.15 / aspect)
  const eye = {
    iso: [d * 0.55, d * 0.7, d * 0.75],
    top: [0, d * 1.1, 0.001],
    bottom: [0, -d * 1.1, 0.001],
  }[preset]

  controls.setLookAt(eye[0] ?? 0, eye[1] ?? 0, eye[2] ?? 0, 0, 0, 0, smooth)
}

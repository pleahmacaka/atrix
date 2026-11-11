import { Box3, type Ray, Vector3 } from "three"
import type { Pcb, Side } from "../types.ts"
import { boxInWorld } from "./view.ts"

export type PartBox = { ref: string; side: Side; box: Box3 }

export const partBoxes = (pcb: Pcb, explode: number): PartBox[] =>
  pcb.footprints.flatMap(f => {
    if (!f.box3d) {
      return []
    }

    const { center, size } = boxInWorld(pcb, f.box3d)
    const lift = (f.side === "bottom" ? -1 : 1) * explode
    const middle = new Vector3(center[0], center[1] + lift, center[2])

    return [
      {
        ref: f.ref,
        side: f.side,
        box: new Box3().setFromCenterAndSize(middle, new Vector3(...size)),
      },
    ]
  })

const hit = new Vector3()

export const pickPart = (boxes: PartBox[], ray: Ray) => {
  let best: { ref: string; distance: number } | null = null

  for (const { ref, box } of boxes) {
    if (!ray.intersectBox(box, hit)) {
      continue
    }

    const distance = hit.distanceTo(ray.origin)

    if (!best || distance < best.distance) {
      best = { ref, distance }
    }
  }

  return best
}

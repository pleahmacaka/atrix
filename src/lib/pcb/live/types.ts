export type BoardMeta = {
  width: number
  height: number
  originX: number
  originY: number
  thickness: number
  copperLayers: number
  tracks: number
  trackLength: number
  vias: number
  footprints: number
  nets: number
  parts: { lcsc: string; qty: number; value: string }[]
}

export type LiveRender = {
  stamp: string
  file: string
  meta: BoardMeta
  layers: string[]
  unrouted: { net: string; from: [number, number]; to: [number, number] }[]
}

export type LiveSeed = {
  seed: number
  pass: number
  unrouted: number | null
  violations: number | null
  errors: number | null
  warnings: number | null
  state: "queued" | "routing" | "checked" | "clean"
  render: LiveRender | null
}

export type LiveStatus = {
  stage: "placement" | "routing" | "done"
  base: LiveRender | null
  seeds: LiveSeed[]
  updated_at: string
}

export type Side = "top" | "bottom"

export type Vec3 = [number, number, number]

export type Box3 = { min: Vec3; max: Vec3 }

export type Footprint = {
  ref: string
  value: string
  side: Side
  box3d: Box3 | null
  at?: [number, number]
  nets?: string[]
  category?: string
  purpose?: string
  block?: string
}

export type MountingHole = { at: [number, number]; diameter: number }

export type Extreme = { mm: number; ref: string }

export type Overhang = {
  ref: string
  side: "left" | "top" | "right" | "bottom"
  mm: number
}

export type Dimensions = {
  board: Box3
  envelope: Box3
  envelopeLonger: boolean
  above: Extreme
  below: Extreme
  overhangs: Overhang[]
}

export type Pcb = {
  layers: string[]
  footprints: Footprint[]
  holes: MountingHole[]
  nets: number
  vias: number
  dims: Dimensions
}

export type Path = number[]

export type Polygon = Path[]

export type CopperLayer = { name: string; z: [bottom: number, top: number] }

export type Drill = {
  at: [number, number]
  diameter: number
  plated: boolean
  net: string
  span: [number, number]
}

export type Copper = {
  layers: CopperLayer[]
  outline: Path[]
  body: [bottom: number, top: number]
  nets: Record<string, Record<string, Polygon[]>>
  pours: string[]
  drills: Drill[]
}

export type ArtworkPad = {
  ref: string
  number: string
  net: string
  side: Side
  at: [number, number]
}

export type Artwork = {
  silk: Record<string, Polygon[]>
  pads: ArtworkPad[]
}

export type StackupLayer = {
  kind: "mask" | "copper" | "dielectric"
  layer: number | null
  name: string
  material: string
  cu: string
  mm: number
  er: number | null
}

export type ImpedanceLine = {
  name: string
  layer: string
  reference: string
  width: number
  space: number | null
  gnd: number | null
  target: number
  calculated: number
}

export type Stackup = {
  layers: StackupLayer[]
  total: number
  lines: ImpedanceLine[]
}

export type SchematicSheet = { file: string; title: string }

export type SchematicIndex = { sheets: SchematicSheet[]; pdf: string | null }

export type SheetBox = { x: number; y: number; width: number; height: number }

export type SheetLabel = SheetBox & { text: string; transform: string }

export type SheetLabels = { origin: SheetBox; labels: SheetLabel[] }

export type RenderView = {
  file: string
  label: string
  width: number
  height: number
}

export type LcscInfo = {
  package: string
  category: string
  group: string
  manufacturer: string
  summary: string
}

export type BomLine = {
  value: string
  refs: string[]
  package: string
  lcsc: string
  mpn: string
  category?: string
  pins?: number
  info?: LcscInfo
}

export type PriceLadder = [quantity: number, usd: number][]

export type PurchaseItem = {
  name: string
  qty: number
  note?: string
  url?: string
  usd?: number
}

export type FileStamp = { sha256: string; size: number }

export type Manifest = {
  generated_at: string
  title?: string
  source: FileStamp & { path: string }
  outputs: Record<string, FileStamp>
}

export type ZephyrKind =
  | "spi"
  | "uwb"
  | "accel"
  | "led"
  | "button"
  | "uart"
  | "usb"
  | "swd"
  | "reset"

export type ZephyrPin = { pad: string; pin: string; net: string; role: string }

export type ZephyrNode = {
  id: string
  kind: ZephyrKind
  parts: string[]
  pins: ZephyrPin[]
  notes: string[]
}

export type ZephyrUnresolved = {
  pad: string
  pin: string
  net: string
  parts: string[]
}

export type ZephyrReport = {
  module: string
  mcu: string
  soc: string
  base: string
  board: string
  vendor: string
  starter: { repo: string; sha: string }
  nodes: ZephyrNode[]
  unresolved: ZephyrUnresolved[]
}

export const LAYERS = ["body", "copper", "mask", "silk", "parts"] as const

export type Layer = (typeof LAYERS)[number]

export const DERIVED = {
  manifest: "manifest.json",
  pcb: "pcb.json",
  copper: "copper.json",
  artwork: "artwork.json",
  bom: "bom.json",
  prices: "prices.json",
  purchase: "purchase.json",
  design: "design.md",
  drawing: "dims/drawing.svg",
  renders: "render/index.json",
  render: (file: string) => `render/${file}`,
  schematic: "schematic/index.json",
  sheet: (file: string) => `schematic/${file}`,
  sheetLabels: (file: string) => `schematic/${file.replace(".svg", ".json")}`,
  glb: (layer: Layer) => `board-${layer}.glb`,
  stackup: "stackup.json",
  zephyrReport: "zephyr/report.json",
  zephyrProject: "zephyr/project.zip",
  zephyr: (file: string) => `zephyr/files/${file}`,
} as const

export type BoardId = string | null

export const ASSEMBLY = "assembly"

export const derivedDir = (board: BoardId) =>
  board ? `derived-${board}` : "derived"

export const derivedPrefix = (projectId: string, board: BoardId = null) =>
  `${projectId}/${derivedDir(board)}`

export const derivedName = (
  projectId: string,
  file: string,
  board: BoardId = null,
) => `${derivedPrefix(projectId, board)}/${file}`

export const boardsOf = (projectId: string, names: string[]): BoardId[] => {
  const extra = names.flatMap(name => {
    const [project, dir, file] = name.split("/")

    return project === projectId &&
      file === DERIVED.manifest &&
      dir?.startsWith("derived-") &&
      dir !== derivedDir(ASSEMBLY)
      ? [dir.slice("derived-".length)]
      : []
  })

  return [null, ...extra.toSorted()]
}

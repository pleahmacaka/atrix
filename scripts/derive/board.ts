import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import {
  type bbox,
  type Document,
  getBounds,
  type Node,
  NodeIO,
} from "@gltf-transform/core"
import {
  type Artwork,
  type BomLine,
  type Box3,
  type Copper,
  DERIVED,
  type Dimensions,
  type Footprint,
  LAYERS,
  type Layer,
  type MountingHole,
  type Overhang,
  type Pcb,
  type Polygon,
  type Side,
} from "../../src/lib/pcb/types.ts"
import { type Context, run } from "./cli.ts"
import { designDoc } from "./design.ts"
import { type Ring, TOLERANCE, writeDrawing } from "./dims.ts"
import { lcscParts } from "./prices.ts"
import { type RolePart, rolesOf } from "./roles.ts"

const COPPER_MM = 0.035

const PASSIVES = ["resistor_res", "capacitor_cap", "inductor_ind"]

const EXPORT_FLAGS: Record<Layer, string[]> = {
  body: ["--board-only"],
  copper: [
    "--board-only",
    "--no-board-body",
    "--include-tracks",
    "--include-pads",
    "--include-zones",
  ],
  mask: ["--board-only", "--no-board-body", "--include-soldermask"],
  silk: ["--board-only", "--no-board-body", "--include-silkscreen"],
  parts: ["--no-board-body", "--subst-models"],
}

type DumpFootprint = RolePart & {
  lcsc: string
  side: Side
  bom: boolean
}

type Dump = {
  thickness: number
  outline: Ring[]
  layers: string[]
  footprints: DumpFootprint[]
  holes: MountingHole[]
  nets: number
  vias: number
  copper: Record<string, Record<string, Polygon[]>>
  pours: string[]
  drills: Copper["drills"]
  silk: Artwork["silk"]
  pads: Artwork["pads"]
}

const io = new NodeIO()

const round = (mm: number) => Math.round(mm * 100) / 100

const boxOf = ({ min, max }: bbox): Box3 => ({
  min: [round(min[0] * 1000), round(min[2] * 1000), round(min[1] * 1000)],
  max: [round(max[0] * 1000), round(max[2] * 1000), round(max[1] * 1000)],
})

const union = (boxes: Box3[]): Box3 => {
  const axis = (k: 0 | 1 | 2) => ({
    min: Math.min(...boxes.map(b => b.min[k])),
    max: Math.max(...boxes.map(b => b.max[k])),
  })
  const [x, y, z] = [axis(0), axis(1), axis(2)]

  return { min: [x.min, y.min, z.min], max: [x.max, y.max, z.max] }
}

const sceneOf = (doc: Document) => {
  const scene = doc.getRoot().listScenes()[0]

  if (!scene) {
    throw new Error("kicad-cli wrote a GLB without a scene")
  }

  return scene
}

const exportGlb = async (ctx: Context, layer: Layer) => {
  const raw = join(ctx.scratch, `${layer}.raw.glb`)

  await run(
    [
      ctx.kicadCli,
      "pcb",
      "export",
      "glb",
      "-f",
      "-o",
      raw,
      ...EXPORT_FLAGS[layer],
      ctx.boardFile,
    ],
    ctx.scratch,
  )

  return raw
}

const footprintNodes = (doc: Document) =>
  sceneOf(doc)
    .listChildren()
    .flatMap(top => top.listChildren())

const meshNodes = (node: Node) => {
  const found: Node[] = []

  node.traverse(n => {
    if (n.getMesh()) {
      found.push(n)
    }
  })

  return found
}

const groupBySide = (doc: Document, sides: Map<string, Side>) => {
  const scene = sceneOf(doc)
  const groups: Record<Side, Node> = {
    top: doc.createNode("top"),
    bottom: doc.createNode("bottom"),
  }
  const stale: Node[] = []

  for (const root of scene.listChildren()) {
    root.traverse(n => stale.push(n))
  }

  for (const footprint of footprintNodes(doc)) {
    const ref = footprint.getName()
    const group = doc.createNode(ref)

    groups[sides.get(ref) ?? "top"].addChild(group)

    for (const mesh of meshNodes(footprint)) {
      mesh.setMatrix(mesh.getWorldMatrix())
      group.addChild(mesh)
    }
  }

  for (const node of stale.filter(n => !n.getMesh())) {
    node.dispose()
  }

  scene.addChild(groups.top).addChild(groups.bottom)
}

const optimize = (ctx: Context, input: string, layer: Layer) =>
  run(
    [
      process.execPath,
      join(ctx.root, "node_modules/@gltf-transform/cli/bin/cli.js"),
      "optimize",
      input,
      join(ctx.staging, DERIVED.glb(layer)),
      "--compress",
      "meshopt",
      "--palette",
      "false",
      "--texture-compress",
      "false",
      ...(layer === "parts"
        ? ["--flatten", "false", "--instance", "false"]
        : []),
    ],
    ctx.scratch,
  )

const dimensionsOf = (board: Box3, parts: Map<string, Box3>): Dimensions => {
  const entries = [...parts]
  const above = entries.toSorted(([, a], [, b]) => b.max[2] - a.max[2])[0]
  const below = entries.toSorted(([, a], [, b]) => a.min[2] - b.min[2])[0]
  const envelope = union([board, ...parts.values()])

  const overhangs: Overhang[] = entries.flatMap(([ref, b]) => {
    const sides = {
      left: board.min[0] - b.min[0],
      top: board.min[1] - b.min[1],
      right: b.max[0] - board.max[0],
      bottom: b.max[1] - board.max[1],
    }

    return Object.entries(sides)
      .filter(([, mm]) => mm > TOLERANCE)
      .map(([side, mm]) => ({
        ref,
        side: side as Overhang["side"],
        mm: round(mm),
      }))
  })

  return {
    board,
    envelope,
    envelopeLonger:
      envelope.max[1] - envelope.min[1] - (board.max[1] - board.min[1]) >
      TOLERANCE,
    above: {
      mm: round((above?.[1].max[2] ?? 0) - board.max[2]),
      ref: above?.[0] ?? "",
    },
    below: {
      mm: round(board.min[2] - (below?.[1].min[2] ?? 0)),
      ref: below?.[0] ?? "",
    },
    overhangs,
  }
}

const isDigits = (text: string) =>
  text.length > 0 && [...text].every(c => c >= "0" && c <= "9")

const withoutCopySuffix = (name: string) => {
  const cut = name.lastIndexOf("_")
  const tail = name.slice(cut + 1)

  return cut > 0 && isDigits(tail) && !tail.startsWith("0")
    ? name.slice(0, cut)
    : name
}

const packageOf = (footprint: string) => {
  const name = withoutCopySuffix(footprint)
  const passive = PASSIVES.find(p => name.startsWith(p))
  const size = passive ? name.slice(passive.length) : ""

  return size.length === 4 && isDigits(size) ? size : name
}

const bomOf = (
  footprints: DumpFootprint[],
  categoryOf: (ref: string) => string | undefined,
): BomLine[] => {
  const lines = footprints
    .filter(f => f.bom)
    .map(f => ({
      ref: f.ref,
      value: f.mpn || f.value,
      package: packageOf(f.footprint),
      lcsc: f.lcsc.split(",")[0]?.trim() ?? "",
      mpn: f.mpn,
      category: categoryOf(f.ref),
      pins: new Set(f.pads.map(p => p.net).filter(Boolean)).size,
    }))

  return Object.values(
    Object.groupBy(lines, l => `${l.value}|${l.lcsc}|${l.package}`),
  ).flatMap(group => {
    const [first] = group ?? []

    return first
      ? [
          {
            value: first.value,
            refs: (group ?? []).map(l => l.ref).toSorted(),
            package: first.package,
            lcsc: first.lcsc,
            mpn: first.mpn,
            category: first.category,
            pins: Math.max(...(group ?? []).map(l => l.pins)),
          },
        ]
      : []
  })
}

const copperOf = (dump: Dump, body: [number, number]): Copper => {
  const [bottom, top] = body
  const count = dump.layers.length
  const gap =
    count > 1 ? (top - bottom - (count - 2) * COPPER_MM) / (count - 1) : 0
  const flat = (ring: Ring) => ring.flat()
  const micron = (mm: number) => Math.round(mm * 1000) / 1000

  return {
    layers: dump.layers.map((name, i) => {
      const upper = top + COPPER_MM - i * (gap + COPPER_MM)

      return { name, z: [micron(upper - COPPER_MM), micron(upper)] }
    }),
    outline: dump.outline.map(flat),
    body,
    nets: dump.copper,
    pours: dump.pours,
    drills: dump.drills,
  }
}

export const deriveBoard = async (ctx: Context) => {
  const dumpFile = join(ctx.scratch, "dump.json")

  await run(
    [
      join(ctx.kicadBin, "python.exe"),
      "-I",
      join(ctx.root, "scripts/derive-pcb.py"),
      ctx.boardFile,
      dumpFile,
    ],
    ctx.scratch,
  )

  const dump: Dump = JSON.parse(readFileSync(dumpFile, "utf8"))
  const raws = {} as Record<Layer, string>

  // concurrent kicad-cli glb exports of one board write truncated files
  for (const layer of LAYERS) {
    raws[layer] = await exportGlb(ctx, layer)
  }

  const [body, parts] = await Promise.all([
    io.read(raws.body),
    io.read(raws.parts),
  ])
  const boxes = new Map(
    footprintNodes(parts).map(n => [n.getName(), boxOf(getBounds(n))]),
  )
  const extent = boxOf(getBounds(sceneOf(body)))
  const middle = (extent.min[2] + extent.max[2]) / 2
  const board: Box3 = {
    min: [extent.min[0], extent.min[1], round(middle - dump.thickness / 2)],
    max: [extent.max[0], extent.max[1], round(middle + dump.thickness / 2)],
  }

  groupBySide(parts, new Map(dump.footprints.map(f => [f.ref, f.side])))
  raws.parts = join(ctx.scratch, "parts.sided.glb")
  await io.write(raws.parts, parts)
  await Promise.all(LAYERS.map(l => optimize(ctx, raws[l], l)))

  const readmeDir = ctx.ancestorWith("README.md")
  const readme = ctx.readme ?? (readmeDir ? join(readmeDir, "README.md") : null)
  const design = readme ? designDoc(readFileSync(readme, "utf8")) : null
  const roles = rolesOf(dump.footprints, dump.pours, design?.markdown ?? null)

  const footprints: Footprint[] = dump.footprints.map(f => ({
    ref: f.ref,
    value: f.value,
    side: f.side,
    box3d: boxes.get(f.ref) ?? null,
    at: f.at,
    ...roles.get(f.ref),
  }))

  const pcb: Pcb = {
    layers: dump.layers,
    footprints,
    holes: dump.holes,
    nets: dump.nets,
    vias: dump.vias,
    dims: dimensionsOf(board, boxes),
  }

  writeFileSync(join(ctx.staging, DERIVED.pcb), JSON.stringify(pcb))
  writeFileSync(
    join(ctx.staging, DERIVED.copper),
    JSON.stringify(copperOf(dump, [extent.min[2], extent.max[2]])),
  )
  writeFileSync(
    join(ctx.staging, DERIVED.artwork),
    JSON.stringify({ silk: dump.silk, pads: dump.pads } satisfies Artwork),
  )
  const lcsc = await lcscParts(
    ctx.root,
    dump.footprints.map(f => f.lcsc.split(",")[0]?.trim() ?? ""),
  )
  const bom = bomOf(dump.footprints, ref => roles.get(ref)?.category).map(l => {
    const info = lcsc.get(l.lcsc)?.info

    return info ? { ...l, info } : l
  })

  writeFileSync(join(ctx.staging, DERIVED.bom), JSON.stringify(bom))
  writeFileSync(
    join(ctx.staging, DERIVED.prices),
    JSON.stringify(
      Object.fromEntries(
        bom
          .map(l => [l.lcsc, lcsc.get(l.lcsc)?.ladder ?? []])
          .filter(([code]) => code),
      ),
    ),
  )

  const listed = `layout/${basename(ctx.boardFile, ".kicad_pcb")}.${DERIVED.purchase}`
  const listedDir = ctx.ancestorWith(listed)
  const purchase = existsSync(join(ctx.source, DERIVED.purchase))
    ? join(ctx.source, DERIVED.purchase)
    : listedDir && join(listedDir, listed)

  if (purchase) {
    writeFileSync(join(ctx.staging, DERIVED.purchase), readFileSync(purchase))
  }

  if (design) {
    const { markdown, dropped } = design

    writeFileSync(join(ctx.staging, DERIVED.design), markdown)
    console.log(`${DERIVED.design}: dropped ${dropped.length}`)

    for (const note of dropped) {
      console.log(`  - ${note}`)
    }
  }

  writeDrawing(ctx, dump.outline, pcb.dims, boxes)

  return pcb.dims
}

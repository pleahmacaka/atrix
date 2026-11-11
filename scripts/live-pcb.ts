import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import type {
  BoardMeta,
  LiveRender,
  LiveSeed,
  LiveStatus,
} from "../src/lib/pcb/live/types.ts"
import { run } from "./derive/cli.ts"

const LAYERS = ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu", "F.Silkscreen", "Edge.Cuts"]

const PASS =
  /Auto-routing pass #(\d+) .* \((\d+) unrouted and (\d+) violations\)/g

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    interval: { type: "string", default: "2000" },
    out: { type: "string" },
  },
})

const [dir] = positionals

if (!dir || !values.out) {
  throw new Error("usage: bun scripts/live-pcb.ts <kicad dir> --out <dir>")
}

const source = resolve(dir)

const PREROUTE = ".preroute.kicad_pcb"

const stem =
  readdirSync(source)
    .find(n => n.endsWith(PREROUTE))
    ?.slice(0, -PREROUTE.length) ?? "board"

const root = resolve(import.meta.dir, "..")
const out = resolve(values.out)
const kicadBin =
  process.env.KICAD_BIN ??
  join(process.env.LOCALAPPDATA ?? "", "Programs/KiCad/10.0/bin")
const kicadCli = join(kicadBin, "kicad-cli.exe")
const kicadPython = join(kicadBin, "python.exe")

type DrcItem = { description: string; pos: { x: number; y: number } }

const text = (path: string) =>
  existsSync(path) ? readFileSync(path, "utf-8") : ""

const numberAfter = (log: string, label: string) => {
  const line = log.split("\n").findLast(l => l.startsWith(`${label}:`))

  return line ? Number.parseInt(line.slice(label.length + 1), 10) : null
}

const netOf = (item: DrcItem) => {
  const open = item.description.indexOf("[")
  const close = item.description.indexOf("]", open)

  return open >= 0 && close > open
    ? item.description.slice(open + 1, close)
    : ""
}

const cache = new Map<string, LiveRender>()

const renderBoard = async (key: string, board: string): Promise<LiveRender> => {
  const stamp = `${board}:${statSync(board).mtimeMs}`
  const known = cache.get(key)

  if (known?.stamp === stamp) {
    return known
  }

  const folder = `${key}-${Bun.hash(stamp).toString(36)}`
  const staging = join(out, "next")

  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  await run(
    [
      kicadCli,
      "pcb",
      "export",
      "svg",
      "--mode-multi",
      "--page-size-mode",
      "2",
      "--exclude-drawing-sheet",
      "--black-and-white",
      "-l",
      LAYERS.join(","),
      "-o",
      staging,
      board,
    ],
    source,
  )

  const svgs = readdirSync(staging).filter(n => n.endsWith(".svg"))
  const layers = Object.fromEntries(
    LAYERS.flatMap(layer => {
      const file = svgs.find(f => f.endsWith(`-${layer.replace(".", "_")}.svg`))

      return file
        ? [
            [
              layer,
              readFileSync(join(staging, file), "utf-8")
                .replaceAll(/fill:#[0-9A-Fa-f]{6}/g, "fill:currentColor")
                .replaceAll("fill-opacity:1.0000", "fill-opacity:0.22")
                .replaceAll(/stroke:#[0-9A-Fa-f]{6}/g, "stroke:currentColor"),
            ],
          ]
        : []
    }),
  )
  const bundle = `${folder}.json`

  writeFileSync(join(out, bundle), JSON.stringify(layers))
  rmSync(staging, { recursive: true, force: true })

  if (known) {
    rmSync(join(out, known.file), { force: true })
  }

  const meta: BoardMeta = JSON.parse(
    await run(
      [kicadPython, join(root, "scripts/derive/board_meta.py"), board],
      source,
    ),
  )
  const drc = join(board, "..", "drc.json")
  const unconnected: { items: DrcItem[] }[] = existsSync(drc)
    ? JSON.parse(text(drc)).unconnected_items
    : []

  const rendered: LiveRender = {
    stamp,
    file: bundle,
    meta,
    layers: Object.keys(layers),
    unrouted: unconnected
      .filter(u => u.items.length === 2)
      .map(({ items: [a, b] }) => ({
        net: netOf(a),
        from: [a.pos.x - meta.originX, a.pos.y - meta.originY],
        to: [b.pos.x - meta.originX, b.pos.y - meta.originY],
      })),
  }

  cache.set(key, rendered)

  return rendered
}

const seedOf = async (name: string): Promise<LiveSeed> => {
  const path = join(source, name)
  const log = text(join(path, "log.txt"))
  const last = [...log.matchAll(PASS)].at(-1)
  const errors = numberAfter(log, "errors")
  const board = join(path, `${stem}.kicad_pcb`)
  const state = existsSync(join(path, "clean"))
    ? "clean"
    : errors !== null
      ? "checked"
      : last
        ? "routing"
        : "queued"

  return {
    seed: Number.parseInt(name.slice("seed-".length), 10),
    pass: last ? Number(last[1]) : 0,
    unrouted: last ? Number(last[2]) : null,
    violations: last ? Number(last[3]) : null,
    errors,
    warnings: numberAfter(log, "warnings"),
    state,
    render:
      errors !== null && existsSync(board)
        ? await renderBoard(name, board)
        : null,
  }
}

const tick = async () => {
  const preroute = join(source, `${stem}${PREROUTE}`)
  const since = existsSync(preroute) ? statSync(preroute).mtimeMs : 0
  const seeds: LiveSeed[] = []

  for (const name of readdirSync(source).filter(
    n => n.startsWith("seed-") && statSync(join(source, n)).mtimeMs >= since,
  )) {
    seeds.push(await seedOf(name))
  }

  seeds.sort((a, b) => a.seed - b.seed)

  const base = [preroute, join(source, `${stem}.kicad_pcb`)].find(existsSync)
  const status: LiveStatus = {
    stage:
      seeds.length === 0
        ? "placement"
        : seeds.every(s => s.errors !== null)
          ? "done"
          : "routing",
    base: base ? await renderBoard("base", base) : null,
    seeds,
    updated_at: new Date().toISOString(),
  }

  writeFileSync(join(out, "status.tmp"), JSON.stringify(status))
  renameSync(join(out, "status.tmp"), join(out, "status.json"))
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
console.log(`watching ${source}`)
console.log(`writing ${out}`)

while (true) {
  await tick().catch(e => console.error(e instanceof Error ? e.message : e))
  await Bun.sleep(Number(values.interval))
}

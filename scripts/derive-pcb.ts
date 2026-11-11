import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { DERIVED, type Manifest } from "../src/lib/pcb/types.ts"
import { deriveBoard } from "./derive/board.ts"
import { type Context, contextOf, filesUnder, stamp } from "./derive/cli.ts"
import { deriveRenders } from "./derive/render.ts"
import { deriveSchematic } from "./derive/schematic.ts"
import { deriveStackup } from "./derive/stackup.ts"
import { deriveZephyr } from "./derive/zephyr.ts"

const derive = async (ctx: Context) => {
  if (!existsSync(ctx.boardFile)) {
    throw new Error(`no board.kicad_pcb in ${ctx.source}`)
  }

  const failed = (
    await Promise.allSettled([
      deriveBoard(ctx),
      deriveSchematic(ctx),
      deriveRenders(ctx),
      deriveZephyr(ctx),
      deriveStackup(ctx),
    ])
  ).find(r => r.status === "rejected")

  if (failed) {
    throw failed.reason
  }

  const manifest: Manifest = {
    generated_at: new Date().toISOString(),
    ...(ctx.title && { title: ctx.title }),
    source: {
      path: ctx.board ? `${ctx.board}/board.kicad_pcb` : "board.kicad_pcb",
      ...stamp(ctx.boardFile),
    },
    outputs: Object.fromEntries(
      filesUnder(ctx.staging).map(name => [
        name,
        stamp(join(ctx.staging, name)),
      ]),
    ),
  }

  writeFileSync(
    join(ctx.staging, DERIVED.manifest),
    JSON.stringify(manifest, null, 2),
  )

  rmSync(ctx.out, { recursive: true, force: true })
  mkdirSync(dirname(ctx.out), { recursive: true })
  renameSync(ctx.staging, ctx.out)

  if (ctx.board) {
    const index = join(dirname(ctx.out), `${ctx.project}.boards.json`)
    const known: string[] = existsSync(index)
      ? JSON.parse(readFileSync(index, "utf-8"))
      : []

    writeFileSync(index, JSON.stringify([...new Set([...known, ctx.board])]))
  }

  return manifest
}

const ctx = contextOf(Bun.argv.slice(2))

try {
  const manifest = await derive(ctx)
  const sizes = Object.entries(manifest.outputs)

  console.log(`source ${ctx.boardFile}`)
  console.log(`output ${ctx.out}`)

  for (const [name, { size }] of sizes) {
    console.log(
      `  ${name.padEnd(28)} ${(size / 1024).toFixed(1).padStart(8)} KB`,
    )
  }

  console.log(
    `  total ${(sizes.reduce((s, [, o]) => s + o.size, 0) / 1048576).toFixed(2)} MB`,
  )
} finally {
  rmSync(ctx.scratch, { recursive: true, force: true })
}

import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import { DERIVED } from "../../src/lib/pcb/types.ts"
import { type Context, run } from "./cli.ts"

const SCRIPT = "scripts/stacktable.py"

const layoutOf = (ctx: Context, root: string) => {
  const named = join(
    root,
    `layout/${basename(ctx.boardFile, ".kicad_pcb")}.placement.json`,
  )

  return existsSync(named) ? named : join(root, "layout/placement.json")
}

export const deriveStackup = async (ctx: Context) => {
  const root = ctx.ancestorWith(SCRIPT)
  const layout = root && layoutOf(ctx, root)

  if (!root || !layout || !existsSync(layout)) {
    return
  }

  await run(
    [
      join(ctx.kicadBin, "python.exe"),
      "-I",
      join(root, SCRIPT),
      layout,
      join(ctx.staging, DERIVED.stackup),
    ],
    ctx.scratch,
  )
}

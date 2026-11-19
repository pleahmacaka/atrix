import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { DERIVED, type RenderView } from "../../src/lib/pcb/types.ts"
import { type Context, run } from "./cli.ts"

const SIZE = { width: 2000, height: 1500 }

const ISO = ["--perspective", "--rotate", "-45,0,45", "--zoom", "0.7"]

const RENDERS = [
  {
    file: "top.png",
    label: "윗면",
    flags: ["--side", "top", "--zoom", "0.75"],
  },
  {
    file: "bottom.png",
    label: "밑면",
    flags: ["--side", "bottom", "--zoom", "0.75"],
  },
  { file: "iso-top.png", label: "윗면 등각", flags: ISO },
  {
    file: "iso-bottom.png",
    label: "밑면 등각",
    flags: ["--side", "bottom", ...ISO],
  },
]

export const deriveRenders = async (ctx: Context) => {
  const index = join(ctx.staging, DERIVED.renders)

  mkdirSync(dirname(index))

  await Promise.all(
    RENDERS.map(r =>
      run(
        [
          ctx.kicadCli,
          "pcb",
          "render",
          "--quality",
          "high",
          "--background",
          "opaque",
          "--width",
          String(SIZE.width),
          "--height",
          String(SIZE.height),
          ...r.flags,
          "-o",
          join(ctx.staging, DERIVED.render(r.file)),
          ctx.boardFile,
        ],
        ctx.scratch,
      ),
    ),
  )

  const views: RenderView[] = RENDERS.map(({ file, label }) => ({
    file,
    label,
    ...SIZE,
  }))

  writeFileSync(index, JSON.stringify(views))
}

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join } from "node:path"
import { DERIVED, type SchematicIndex } from "../../src/lib/pcb/types.ts"
import { type Context, exec, filesUnder, python, run } from "./cli.ts"

const COPY_SKIPPED = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "build-emu",
])

const PDF = "schematic.pdf"

const circuitOf = (ctx: Context) =>
  `src/${basename(ctx.boardFile, ".kicad_pcb")}.circuit.tsx`

const buildSchematic = async (ctx: Context, dir: string) => {
  const work = join(ctx.scratch, "circuit")

  cpSync(dir, work, {
    recursive: true,
    filter: path => !COPY_SKIPPED.has(basename(path)),
  })

  await run([process.execPath, "install", "--frozen-lockfile"], work)

  // tsci exits 1 on placement overlaps that the KiCad layout resolves later; only the schematic matters here
  const build = await exec(
    [process.execPath, "x", "tsci", "build", circuitOf(ctx), "--kicad-project"],
    work,
  )
  const dist = join(work, "dist")
  const sch = existsSync(dist)
    ? filesUnder(dist).find(f => f.endsWith(".kicad_sch"))
    : undefined

  if (!sch) {
    throw new Error(
      `tsci build wrote no schematic\n${build.stderr}${build.stdout}`,
    )
  }

  return join(dist, sch)
}

export const deriveSchematic = async (ctx: Context) => {
  const circuit = circuitOf(ctx)
  const dir = ctx.ancestorWith(circuit)

  if (!dir) {
    console.log(`no ${circuit} near ${ctx.source}, skipped schematic`)

    return
  }

  const sch = await buildSchematic(ctx, dir)
  const plots = join(ctx.scratch, "schematic")
  const pdf = join(ctx.scratch, PDF)
  const target = dirname(join(ctx.staging, DERIVED.schematic))

  mkdirSync(target)

  await Promise.all([
    run(
      [ctx.kicadCli, "sch", "export", "svg", "-e", "-o", plots, sch],
      ctx.scratch,
    ),
    run(
      [ctx.kicadCli, "sch", "export", "pdf", "-e", "-o", pdf, sch],
      ctx.scratch,
    ),
  ])

  const rootSheet = `${basename(sch, ".kicad_sch")}.svg`
  const plotted = readdirSync(plots)
    .filter(n => n.endsWith(".svg"))
    .toSorted(
      (a, b) =>
        Number(b === rootSheet) - Number(a === rootSheet) || a.localeCompare(b),
    )
  const files = plotted.map((name, i) => {
    const file = `sheet-${i + 1}.svg`

    renameSync(join(plots, name), join(ctx.staging, DERIVED.sheet(file)))

    return file
  })

  await Promise.all([
    python(
      ctx,
      ctx.sheetsScript,
      "crop-svg",
      ...files.map(f => join(ctx.staging, DERIVED.sheet(f))),
    ),
    python(
      ctx,
      ctx.sheetsScript,
      "crop-pdf",
      pdf,
      join(ctx.staging, DERIVED.sheet(PDF)),
    ),
  ])

  const index: SchematicIndex = {
    sheets: files.map((file, i) => ({
      file,
      title:
        i === 0
          ? ctx.projectName
          : (plotted[i] ?? "").slice(rootSheet.length - 3, -4),
    })),
    pdf: PDF,
  }

  writeFileSync(join(ctx.staging, DERIVED.schematic), JSON.stringify(index))
}

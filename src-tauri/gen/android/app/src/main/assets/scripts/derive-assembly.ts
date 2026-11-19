import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { ASSEMBLY, DERIVED, type Manifest } from "../src/lib/pcb/types.ts"
import { contextOf, filesUnder, run, stamp } from "./derive/cli.ts"

const CASE_PACKAGES = ["build123d==0.13.0", "trimesh==5.2.0", "numpy==2.5.4"]

const FILES = ["assembly.json", "situation.json"]

type Entry = { id: string; board: string | null }

const ctx = contextOf([...Bun.argv.slice(2), "--board", ASSEMBLY])

const derivedRoot = dirname(ctx.out)

const pcbOf = ({ board }: Entry) => {
  const path = join(
    derivedRoot,
    board ? `${ctx.project}-${board}` : ctx.project,
    DERIVED.pcb,
  )

  if (!existsSync(path)) {
    throw new Error(
      `${path} is missing; derive board "${board ?? "main"}" first`,
    )
  }

  return path
}

try {
  const spec = join(ctx.source, "assembly.json")
  const { boards }: { boards: Entry[] } = JSON.parse(
    readFileSync(spec, "utf-8"),
  )
  const pcbs = join(ctx.scratch, "pcbs.json")

  writeFileSync(
    pcbs,
    JSON.stringify(Object.fromEntries(boards.map(b => [b.id, pcbOf(b)]))),
  )

  for (const file of FILES) {
    if (existsSync(join(ctx.source, file))) {
      copyFileSync(join(ctx.source, file), join(ctx.staging, file))
    }
  }

  await run(
    [
      "uv",
      "run",
      "-q",
      ...CASE_PACKAGES.flatMap(p => ["--with", p]),
      "python",
      join(import.meta.dir, "derive", "case.py"),
      spec,
      pcbs,
      ctx.staging,
    ],
    ctx.scratch,
  )

  if (existsSync(join(ctx.source, "fea"))) {
    cpSync(join(ctx.source, "fea"), join(ctx.staging, "fea"), {
      recursive: true,
    })
  }

  const manifest: Manifest = {
    generated_at: new Date().toISOString(),
    source: { path: "assembly/assembly.json", ...stamp(spec) },
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
  mkdirSync(derivedRoot, { recursive: true })
  renameSync(ctx.staging, ctx.out)

  console.log(`output ${ctx.out}`)

  for (const name of Object.keys(manifest.outputs)) {
    console.log(`  ${name}`)
  }
} finally {
  rmSync(ctx.scratch, { recursive: true, force: true })
}

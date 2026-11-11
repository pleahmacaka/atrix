import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"

const PYMUPDF = "pymupdf==1.28.2"

export type Context = ReturnType<typeof contextOf>

const boardFileIn = (dir: string) => {
  const boards = readdirSync(dir).filter(
    n => n.endsWith(".kicad_pcb") && !n.endsWith(".preroute.kicad_pcb"),
  )

  return join(
    dir,
    boards.includes("board.kicad_pcb")
      ? "board.kicad_pcb"
      : (boards[0] ?? "board.kicad_pcb"),
  )
}

export const contextOf = (argv: string[]) => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: { type: "string" },
      board: { type: "string" },
      title: { type: "string" },
      out: { type: "string" },
      readme: { type: "string" },
      firmware: { type: "string" },
    },
  })

  const [path] = positionals

  if (!path || !values.project) {
    throw new Error(
      "usage: bun scripts/derive-pcb.ts <kicad project dir> --project <id> [--board <slug> --title <name>] [--out <dir>] [--readme <file>] [--firmware <dir>]",
    )
  }

  const source = resolve(path)
  const root = resolve(import.meta.dir, "../..")
  const kicadBin =
    process.env.KICAD_BIN ??
    join(process.env.LOCALAPPDATA ?? "", "Programs/KiCad/10.0/bin")
  const scratch = mkdtempSync(join(tmpdir(), "derive-pcb-"))
  const staging = join(scratch, "out")

  mkdirSync(staging)

  const ancestorWith = (name: string) => {
    for (let dir = source; dir !== dirname(dir); dir = dirname(dir)) {
      if (existsSync(join(dir, name))) {
        return dir
      }
    }

    return null
  }

  const board = values.board ?? null

  return {
    source,
    project: values.project,
    board,
    title: values.title ?? null,
    readme: values.readme ? resolve(values.readme) : null,
    firmware: values.firmware ? resolve(values.firmware) : null,
    root,
    out: resolve(
      values.out ??
        join(
          root,
          ".cache/derived",
          board ? `${values.project}-${board}` : values.project,
        ),
    ),
    kicadBin,
    kicadCli: join(kicadBin, "kicad-cli.exe"),
    boardFile: boardFileIn(source),
    sheetsScript: join(root, "scripts/derive-sheets.py"),
    projectName: basename(ancestorWith("package.json") ?? source),
    scratch,
    staging,
    ancestorWith,
  }
}

export const exec = async (cmd: string[], cwd: string) => {
  const child = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return { stdout, stderr, code }
}

export const run = async (cmd: string[], cwd: string) => {
  const result = await exec(cmd, cwd)

  if (result.code !== 0) {
    throw new Error(
      `${cmd.slice(0, 3).join(" ")} failed\n${result.stderr}${result.stdout}`,
    )
  }

  return result.stdout
}

export const python = (ctx: Context, script: string, ...args: string[]) =>
  run(
    [
      "uv",
      "run",
      "--no-project",
      "--with",
      PYMUPDF,
      "python",
      "-I",
      script,
      ...args,
    ],
    ctx.scratch,
  )

export const filesUnder = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => relative(dir, join(e.parentPath, e.name)).replaceAll("\\", "/"))
    .toSorted()

export const stamp = (path: string) => {
  const bytes = readFileSync(path)

  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
  }
}

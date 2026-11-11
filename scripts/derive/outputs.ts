const OUTPUT_EXTENSIONS = new Set([
  "kicad_pcb",
  "kicad_pro",
  "kicad_prl",
  "kicad_dru",
  "kicad_sch",
  "kicad_sym",
  "kicad_mod",
  "kicad_wks",
  "gbr",
  "gbrjob",
  "gtl",
  "gbl",
  "gts",
  "gbs",
  "gto",
  "gbo",
  "gtp",
  "gbp",
  "gko",
  "gm1",
  "drl",
  "xln",
  "csv",
  "pos",
  "rpt",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "svg",
  "step",
  "stp",
  "wrl",
  "glb",
  "gltf",
])

export const SOURCE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "sh",
  "ps1",
  "bat",
  "c",
  "h",
  "cpp",
  "hpp",
  "rs",
  "go",
])

const OUTPUT_NAMES = new Set([
  "fp-lib-table",
  "sym-lib-table",
  "drc.json",
  "erc.json",
])

export const SOURCE_DIRS = new Set([
  "src",
  "scripts",
  "firmware",
  "node_modules",
  "source",
])

export const SOURCE_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
])

const DERIVED_DIR = "derived"

const CAD_DIR = "cad"

const isInnerLayer = (ext: string) =>
  ext.length > 1 &&
  ext.startsWith("g") &&
  Array.from(ext.slice(1)).every(c => c >= "0" && c <= "9")

const unsafeSegment = (segment: string) =>
  segment === "" ||
  segment.startsWith(".") ||
  segment.includes("\\") ||
  segment.includes(":")

export const isOutputPath = (path: string) => {
  const segments = path.split("/")
  const name = segments.at(-1)?.toLowerCase() ?? ""
  const dirs = segments.slice(0, -1).map(s => s.toLowerCase())

  const dot = name.lastIndexOf(".")
  const ext = dot > 0 ? name.slice(dot + 1) : ""

  if (
    segments.some(unsafeSegment) ||
    dirs[0] === CAD_DIR ||
    dirs.some(d => SOURCE_DIRS.has(d)) ||
    SOURCE_NAMES.has(name) ||
    SOURCE_EXTENSIONS.has(ext)
  ) {
    return false
  }

  return (
    OUTPUT_NAMES.has(name) ||
    OUTPUT_EXTENSIONS.has(ext) ||
    isInnerLayer(ext) ||
    dirs[0] === DERIVED_DIR ||
    dirs[0]?.startsWith(`${DERIVED_DIR}-`)
  )
}

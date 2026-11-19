import {
  isOutputPath,
  SOURCE_DIRS,
  SOURCE_EXTENSIONS,
  SOURCE_NAMES,
} from "./outputs.ts"

type Block =
  | { kind: "code"; lines: string[] }
  | { kind: "table"; lines: string[] }
  | {
      kind: "prose"
      prefix: string
      indent: number
      item: boolean
      text: string
    }

type Section = { level: number; title: string; blocks: Block[] }

const BUILD_DIRS = new Set(["layout", "dist", "build"])

const CONFIG_EXTENSIONS = new Set(["json", "yaml", "yml", "toml"])

const COMMANDS = new Set([
  "bun",
  "bunx",
  "npm",
  "npx",
  "pnpm",
  "python",
  "python3",
  "pip",
  "uv",
  "west",
  "git",
  "make",
  "cargo",
  "node",
  "bash",
  "kicad-cli",
  "tsci",
  "renode",
])

const OFF_TOPIC_HEADINGS = [
  "폴더",
  "디렉터리",
  "디렉토리",
  "도구",
  "빌드",
  "파이프라인",
  "생성",
  "명령",
  "함정",
  "펌웨어",
  "소프트웨어",
  "설치",
  "사용법",
  "스크립트",
  "folder",
  "directory",
  "tool",
  "build",
  "pipeline",
  "generat",
  "command",
  "pitfall",
  "gotcha",
  "firmware",
  "software",
  "install",
  "usage",
  "script",
  "setup",
]

const BOARD_HEADINGS = [
  "요구",
  "전원",
  "하드웨어",
  "회로",
  "보드",
  "기판",
  "사양",
  "부품",
  "검증",
  "과제",
  "설계",
  "안테나",
  "절연",
  "requirement",
  "power",
  "hardware",
  "circuit",
  "board",
  "spec",
  "part",
  "component",
  "verification",
  "design",
  "antenna",
  "isolation",
  "stackup",
]

const TOOL_WORDS = new Set([
  "tscircuit",
  "tsci",
  "atopile",
  "jitx",
  "freerouting",
  "specctra",
  "headless",
  "cli",
  "api",
  "swig",
  "zephyr",
  "west",
  "renode",
  "bunx",
  "npm",
  "pip",
  "script",
  "scripts",
  "pipeline",
  "build",
  "repository",
  "repo",
  "firmware",
  "toolchain",
  "sdk",
  "compiler",
])

const TOOL_TERMS = [
  "도구",
  "스크립트",
  "파이프라인",
  "빌드",
  "저장소",
  "펌웨어",
  "컴파일",
  "툴체인",
]

const UNITS = [
  "kΩ",
  "MΩ",
  "Ω",
  "µF",
  "uF",
  "nF",
  "pF",
  "GHz",
  "MHz",
  "kHz",
  "Hz",
  "mA",
  "mm",
  "mil",
  "oz",
  "°C",
  "dB",
  "V",
  "A",
  "W",
  "F",
]

const REF_PARTICLES = [": ", "으로 ", "로 "]

const isDigit = (c: string) => c >= "0" && c <= "9"

const isAsciiLetter = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z")

const includesAny = (text: string, terms: string[]) => {
  const lower = text.toLowerCase()

  return terms.some(t => lower.includes(t))
}

const spansOf = (text: string) => text.split("`").filter((_, i) => i % 2 === 1)

const isCommand = (code: string) => {
  const [first = "", ...rest] = code.split(" ")

  return (
    code.startsWith("-") ||
    (rest.length > 0 &&
      (COMMANDS.has(first.toLowerCase()) || rest.some(w => w.startsWith("-"))))
  )
}

const isSourceRef = (code: string) => {
  const text = code.trim()

  if (isCommand(text)) {
    return true
  }

  if (text.includes(" ")) {
    return false
  }

  const segments = text.toLowerCase().split("/")
  const name = segments.at(-1) ?? ""
  const dot = name.lastIndexOf(".")
  const ext = dot > 0 ? name.slice(dot + 1) : ""

  return (
    segments.slice(0, -1).some(s => SOURCE_DIRS.has(s) || BUILD_DIRS.has(s)) ||
    SOURCE_NAMES.has(name) ||
    SOURCE_EXTENSIONS.has(ext) ||
    CONFIG_EXTENSIONS.has(ext)
  )
}

const isFileRef = (code: string) =>
  isSourceRef(code) ||
  (!code.includes(" ") && (code.endsWith("/") || isOutputPath(code)))

const isNumber = (token: string) =>
  [...token].some(isDigit) &&
  [...token].every(c => isDigit(c) || ".,~-".includes(c))

const isUnit = (token: string) =>
  UNITS.some(u => token.startsWith(u) && !isAsciiLetter(token[u.length] ?? ""))

const isPartRef = (code: string) =>
  code.includes("_") &&
  code === code.toUpperCase() &&
  [...code].some(isAsciiLetter)

const hasHardwareSignal = (text: string) => {
  const tokens = text.split(" ")

  return (
    spansOf(text).some(isPartRef) ||
    tokens.some((t, i) => isNumber(t) && isUnit(tokens[i + 1] ?? ""))
  )
}

const mentionsTools = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some(w => TOOL_WORDS.has(w)) || TOOL_TERMS.some(t => text.includes(t))

const sentencesOf = (text: string) => {
  const sentences: string[] = []
  let start = 0
  let code = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? ""

    if (c === "`") {
      code = !code
    } else if (!code && ".!?".includes(c) && text[i + 1] === " ") {
      sentences.push(text.slice(start, i + 1))
      start = i + 2
    }
  }

  sentences.push(text.slice(start))

  return sentences.map(s => s.trim()).filter(Boolean)
}

const withoutRefs = (sentence: string, stripped: string[]) => {
  let text = sentence

  for (const code of spansOf(sentence).filter(isFileRef)) {
    const quoted = `\`${code}\``
    const at = text.indexOf(quoted)
    const before = text.slice(0, at).trim()
    const after = text.slice(at + quoted.length)
    const particle = REF_PARTICLES.find(p => after.startsWith(p))

    if (!particle || (particle === ": " && before)) {
      return null
    }

    text = text.slice(0, at) + after.slice(particle.length)
    stripped.push(quoted)
  }

  return text.trim() || null
}

const filterProse = (text: string) => {
  if (mentionsTools(text) && !hasHardwareSignal(text)) {
    return { text: null, removed: [text], stripped: [] }
  }

  const kept: string[] = []
  const removed: string[] = []
  const stripped: string[] = []

  for (const sentence of sentencesOf(text)) {
    const clean = withoutRefs(sentence, stripped)

    if (clean) {
      kept.push(clean)
    } else {
      removed.push(sentence)
    }
  }

  return { text: kept.join(" ") || null, removed, stripped }
}

const cellsOf = (line: string) => {
  let row = line.trim()

  if (row.startsWith("|")) {
    row = row.slice(1)
  }

  if (row.endsWith("|")) {
    row = row.slice(0, -1)
  }

  return row.split("|").map(c => c.trim())
}

const isFileCell = (cell: string) => {
  const spans = spansOf(cell)

  return spans.length > 0 && spans.every(isFileRef)
}

const filterTable = (lines: string[]) => {
  const rows = lines.map(cellsOf)
  const [header = [], separator = [], ...body] = rows

  const fileColumns = header.flatMap((_, c) => {
    const cells = body.map(r => r[c] ?? "").filter(Boolean)
    const files = cells.filter(isFileCell).length

    return files * 2 > cells.length ? [c] : []
  })

  const keep = (row: string[]) => row.filter((_, c) => !fileColumns.includes(c))
  const render = (row: string[]) => `| ${keep(row).join(" | ")} |`

  return {
    lines: keep(header).length
      ? [header, separator, ...body].map(render)
      : null,
    removed: fileColumns.map(c => header[c] ?? ""),
  }
}

const headingLevel = (line: string) => {
  let level = 0

  while (line[level] === "#") {
    level++
  }

  return level > 0 && level <= 6 && line[level] === " " ? level : 0
}

const isFence = (line: string) =>
  line.startsWith("```") || line.startsWith("~~~")

const markerOf = (body: string) => {
  const bullet = ["- ", "* ", "+ "].find(m => body.startsWith(m))

  if (bullet) {
    return bullet
  }

  const dot = body.indexOf(". ")

  return dot > 0 && dot <= 3 && [...body.slice(0, dot)].every(isDigit)
    ? body.slice(0, dot + 2)
    : null
}

const startsBlock = (body: string) =>
  !body ||
  isFence(body) ||
  headingLevel(body) > 0 ||
  body.startsWith("|") ||
  markerOf(body) !== null

const parse = (source: string) => {
  const lines = source.replaceAll("\r\n", "\n").split("\n")
  const sections: Section[] = [{ level: 0, title: "", blocks: [] }]
  let i = 0

  const take = (until: (body: string) => boolean) => {
    const taken: string[] = []

    while (i < lines.length && !until((lines[i] ?? "").trimStart())) {
      taken.push(lines[i] ?? "")
      i++
    }

    return taken
  }

  while (i < lines.length) {
    const line = lines[i] ?? ""
    const body = line.trimStart()
    const blocks = sections.at(-1)?.blocks ?? []
    const level = headingLevel(body)
    const marker = markerOf(body)

    if (!body) {
      i++
    } else if (isFence(body)) {
      const fence = body.slice(0, 3)

      i++
      take(b => b.startsWith(fence))
      i++
      blocks.push({ kind: "code", lines: [] })
    } else if (level) {
      sections.push({ level, title: body.slice(level).trim(), blocks: [] })
      i++
    } else if (body.startsWith("|")) {
      blocks.push({ kind: "table", lines: take(b => !b.startsWith("|")) })
    } else if (marker) {
      i++

      const rest = take(startsBlock).map(l => l.trim())

      blocks.push({
        kind: "prose",
        prefix: line.slice(0, line.length - body.length) + marker,
        indent: line.length - body.length,
        item: true,
        text: [body.slice(marker.length), ...rest].join(" "),
      })
    } else {
      i++

      const quote = body.startsWith(">")
      const unquote = (l: string) =>
        quote && l.startsWith(">") ? l.slice(1).trim() : l.trim()
      const rest = take(startsBlock).map(l => unquote(l.trimStart()))

      blocks.push({
        kind: "prose",
        prefix: quote ? "> " : "",
        indent: 0,
        item: false,
        text: [unquote(body), ...rest].join(" "),
      })
    }
  }

  return sections
}

const clip = (text: string) =>
  text.length > 60 ? `${text.slice(0, 60)}…` : text

const withoutOrphanLabels = (blocks: Block[]) =>
  blocks.filter((b, i) => {
    const next = blocks[i + 1]

    return (
      b.kind !== "prose" ||
      b.item ||
      !b.text.endsWith(":") ||
      next?.kind === "table" ||
      (next?.kind === "prose" && next.item)
    )
  })

const filterBlocks = (blocks: Block[], log: (note: string) => void) => {
  const kept: Block[] = []
  let touched = 0
  let droppedIndent = -1

  for (const block of blocks) {
    const orphan =
      droppedIndent >= 0 &&
      block.kind === "prose" &&
      block.item &&
      block.indent > droppedIndent

    if (orphan) {
      continue
    }

    droppedIndent = -1

    if (block.kind === "code") {
      touched++
      log("code block")
    } else if (block.kind === "table") {
      const { lines, removed } = filterTable(block.lines)

      for (const column of removed) {
        log(`table column "${column}"`)
      }

      touched += removed.length ? 1 : 0

      if (lines) {
        kept.push({ kind: "table", lines })
      }
    } else {
      const { text, removed, stripped } = filterProse(block.text)

      for (const sentence of removed) {
        log(`"${clip(sentence)}"`)
      }

      for (const ref of stripped) {
        log(`ref ${ref}`)
      }

      touched += removed.length || stripped.length ? 1 : 0

      if (text) {
        kept.push({ ...block, text })
      } else if (block.item) {
        droppedIndent = block.indent
      }
    }
  }

  return { blocks: withoutOrphanLabels(kept), touched }
}

const render = (section: Section) => {
  const parts = section.level
    ? [`${"#".repeat(section.level)} ${section.title}`]
    : []

  section.blocks.forEach((b, i) => {
    const prev = section.blocks[i - 1]
    const text =
      b.kind === "prose" ? `${b.prefix}${b.text}` : b.lines.join("\n")
    const tight =
      b.kind === "prose" && b.item && prev?.kind === "prose" && prev.item

    if (tight) {
      parts.push(`${parts.pop()}\n${text}`)
    } else {
      parts.push(text)
    }
  })

  return parts.join("\n\n")
}

export const designDoc = (readme: string) => {
  const dropped: string[] = []
  const filtered: Section[] = []
  let droppedLevel = Number.POSITIVE_INFINITY

  for (const section of parse(readme)) {
    if (section.level > droppedLevel) {
      continue
    }

    droppedLevel = Number.POSITIVE_INFINITY

    const name = section.title || "intro"

    if (section.level > 1 && includesAny(section.title, OFF_TOPIC_HEADINGS)) {
      dropped.push(`section "${name}"`)
      droppedLevel = section.level
      continue
    }

    const notes: string[] = []
    const { blocks, touched } = filterBlocks(section.blocks, n => notes.push(n))
    const offTopic =
      section.level > 1 &&
      !includesAny(section.title, BOARD_HEADINGS) &&
      touched * 2 >= section.blocks.length

    if (offTopic) {
      dropped.push(`section "${name}"`)
      droppedLevel = section.level
      continue
    }

    dropped.push(...notes.map(n => `${name}: ${n}`))
    filtered.push({ ...section, blocks })
  }

  const kept = filtered.filter((s, i) => {
    const next = filtered[i + 1]
    const keep =
      s.level <= 1 || s.blocks.length > 0 || (next && next.level > s.level)

    if (!keep) {
      dropped.push(`section "${s.title}" (empty)`)
    }

    return keep
  })

  const markdown = `${kept.map(render).filter(Boolean).join("\n\n")}\n`

  return { markdown, dropped }
}

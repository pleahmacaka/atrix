import DOMPurify from "dompurify"
import { Marked, type Token, type Tokens } from "marked"
import { m } from "#lib/paraglide/messages.js"
import type { BomLine, Box3, Pcb } from "../types.ts"

export type Heading = {
  id: string
  number: string
  html: string
  text: string
  depth: 2 | 3
}

export type Tone = "note" | "warning"

export type Block =
  | { kind: "heading"; heading: Heading }
  | { kind: "overview" }
  | { kind: "facts" }
  | { kind: "parts" }
  | { kind: "html"; html: string }
  | { kind: "table"; html: string }
  | { kind: "code"; code: string }
  | { kind: "tree"; rows: [string, string][] }
  | { kind: "note"; tone: Tone; label: string; html: string }

export type Doc = { lead: string[]; blocks: Block[]; toc: Heading[] }

const markdown = new Marked({
  async: false,
  gfm: true,
  extensions: [
    {
      name: "tilde",
      level: "inline",
      start: src => src.indexOf("~"),
      tokenizer: src =>
        src.startsWith("~") && !src.startsWith("~~")
          ? { type: "tilde", raw: "~" }
          : undefined,
      renderer: () => "~",
    },
  ],
})

const block = (tokens: Token[]) => DOMPurify.sanitize(markdown.parser(tokens))

const inline = (text: string) =>
  DOMPurify.sanitize(markdown.parseInline(text, { async: false }))

const LABELS: Record<string, Tone> = {
  참고: "note",
  주의: "warning",
  경고: "warning",
}

const splitLabel = (text: string, needsColon: boolean) => {
  const source = text.trimStart()

  for (const label of Object.keys(LABELS)) {
    const prefixes = [`**${label}:**`, `**${label}**:`, `${label}:`]

    if (!needsColon) {
      prefixes.push(`**${label}**`, label)
    }

    const prefix = prefixes.find(p => source.startsWith(p))

    if (prefix) {
      return { label, rest: source.slice(prefix.length).trimStart() }
    }
  }

  return null
}

const note = (label: string, html: string): Block => ({
  kind: "note",
  tone: LABELS[label] ?? "note",
  label,
  html,
})

const treeRows = (code: string) => {
  const lines = code.split("\n").filter(l => l.trim())

  const rows = lines.map(l => l.split(/ {2,}/))

  const isTree =
    lines.length > 1 && rows.every(r => r.length > 1 && r[0]?.trim())

  return isTree
    ? rows.map(
        ([path = "", ...rest]) => [path, rest.join(" ")] as [string, string],
      )
    : null
}

const plainOf = (tokens: Token[]): string =>
  tokens
    .map(t =>
      "tokens" in t && t.tokens ? plainOf(t.tokens) : "text" in t ? t.text : "",
    )
    .join("")

const slugger = () => {
  const seen = new Map<string, number>()

  return (text: string) => {
    const base = text.trim().toLowerCase().split(/\s+/).join("-") || "section"
    const count = seen.get(base) ?? 0

    seen.set(base, count + 1)

    return count ? `${base}-${count}` : base
  }
}

const FACTS_SECTION = "보드 사양"

const PARTS_SECTION = "하드웨어 구성"

const convert = (token: Token): Block | null => {
  if (token.type === "space") {
    return null
  }

  if (token.type === "code") {
    const { text, lang } = token as Tokens.Code
    const rows = lang ? null : treeRows(text)

    return rows ? { kind: "tree", rows } : { kind: "code", code: text }
  }

  if (token.type === "table") {
    return { kind: "table", html: block([token]) }
  }

  if (token.type === "blockquote") {
    const { text } = token as Tokens.Blockquote
    const split = splitLabel(text, false)

    return split
      ? note(split.label, block(markdown.lexer(split.rest)))
      : note(m.pcb_doc_note(), block((token as Tokens.Blockquote).tokens))
  }

  if (token.type === "paragraph") {
    const split = splitLabel((token as Tokens.Paragraph).text, true)

    if (split) {
      return note(split.label, inline(split.rest))
    }
  }

  return { kind: "html", html: block([token]) }
}

export const parseDoc = (source: string, hasParts: boolean): Doc => {
  const tokens = markdown.lexer(source)
  const slug = slugger()
  const lead: string[] = []
  const blocks: Block[] = []
  const toc: Heading[] = []
  let major = 0
  let minor = 0
  let started = false
  let droppedTitle = false
  let inParts = false
  let placedFacts = false
  let placedParts = false

  const addHeading = (text: string, html: string, depth: 2 | 3) => {
    if (depth === 2) {
      major += 1
      minor = 0
    } else {
      minor += 1
    }

    const heading: Heading = {
      id: slug(text),
      number: depth === 2 ? `${major}` : `${major}.${minor}`,
      html,
      text,
      depth,
    }

    toc.push(heading)
    blocks.push({ kind: "heading", heading })
  }

  addHeading(m.pcb_doc_overview(), m.pcb_doc_overview(), 2)
  blocks.push({ kind: "overview" })

  for (const token of tokens) {
    if (token.type === "heading") {
      const { depth, tokens: children, text } = token as Tokens.Heading

      if (depth === 1 && !droppedTitle && !started) {
        droppedTitle = true
        continue
      }

      if (depth <= 3) {
        const level = depth === 3 ? 3 : 2

        if (level === 2 && inParts && hasParts) {
          blocks.push({ kind: "parts" })
          placedParts = true
        }

        started = true
        addHeading(plainOf(children), inline(text), level)

        if (level === 2) {
          const title = plainOf(children).trim()

          inParts = title === PARTS_SECTION

          if (title === FACTS_SECTION && !placedFacts) {
            blocks.push({ kind: "facts" })
            placedFacts = true
          }
        }

        continue
      }
    }

    if (!started && token.type === "paragraph") {
      lead.push(block([token]))
      continue
    }

    const converted = convert(token)

    if (converted) {
      started = true
      blocks.push(converted)
    }
  }

  if (!placedFacts) {
    blocks.splice(2, 0, { kind: "facts" })
  }

  if (hasParts && inParts && !placedParts) {
    blocks.push({ kind: "parts" })
    placedParts = true
  }

  if (hasParts && !placedParts) {
    addHeading(m.pcb_doc_key_parts(), m.pcb_doc_key_parts(), 2)
    blocks.push({ kind: "parts" })
  }

  return { lead, blocks, toc }
}

const round = (value: number) => `${Number(value.toFixed(2))}`

const mm = (...values: number[]) => `${values.map(round).join(" × ")} mm`

const sizeOf = ({ min, max }: Box3) => max.map((v, i) => v - (min[i] ?? 0))

export const boardFacts = (pcb: Pcb): [string, string][] => {
  const { board, envelope } = pcb.dims
  const [width = 0, length = 0, thickness = 0] = sizeOf(board)
  const top = pcb.footprints.filter(f => f.side === "top").length
  const bottom = pcb.footprints.length - top

  return [
    [m.pcb_doc_board_size(), mm(width, length)],
    [m.pcb_doc_thickness(), mm(thickness)],
    [
      m.pcb_doc_layers(),
      m.pcb_doc_layers_value({
        count: pcb.layers.length,
        names: pcb.layers.join(", "),
      }),
    ],
    [m.pcb_doc_envelope(), mm(...sizeOf(envelope))],
    [
      m.pcb_doc_parts(),
      m.pcb_doc_parts_value({ count: pcb.footprints.length, top, bottom }),
    ],
    [m.pcb_doc_nets(), m.pcb_doc_count({ count: pcb.nets })],
    [m.pcb_doc_vias(), m.pcb_doc_count({ count: pcb.vias })],
  ]
}

const KEY_PREFIXES = ["U", "J", "Q", "Y"]

const isDigit = (c: string) => c >= "0" && c <= "9"

const prefixOf = (ref: string) => {
  const end = [...ref].findIndex(c => c === "_" || isDigit(c))

  return end === -1 ? ref : ref.slice(0, end)
}

export const keyParts = (lines: BomLine[]) =>
  lines
    .filter(l => l.refs.some(r => KEY_PREFIXES.includes(prefixOf(r))))
    .toSorted((a, b) => (a.refs[0] ?? "").localeCompare(b.refs[0] ?? ""))

export const linkTo = (id: string) => {
  const url = new URL(window.location.href)

  url.hash = id

  return url.toString()
}

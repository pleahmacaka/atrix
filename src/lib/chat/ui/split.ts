import type { Block } from "../blocks.ts"
import { uiBlocksIn } from "./part.ts"

const FENCE = "```atrix-ui"

const FENCE_END = "\n```"

export type TextPart =
  | { kind: "text"; text: string }
  | { kind: "ui"; blocks: Block[] }

const parseBlocks = (json: string) => {
  try {
    return uiBlocksIn(JSON.parse(json))
  } catch {
    return null
  }
}

const bodyAt = (text: string, from: number): number | null => {
  const start = text.indexOf(FENCE, from)

  if (start === -1) {
    return null
  }

  const opens = ["\n", "\r\n"].some(opening =>
    text.startsWith(opening, start + FENCE.length),
  )
  const lineStart = start === 0 || text[start - 1] === "\n"

  return opens && lineStart ? start + FENCE.length : bodyAt(text, start + 1)
}

export const splitUi = (text: string): TextPart[] => {
  const parts: TextPart[] = []
  let rest = text

  for (;;) {
    const body = bodyAt(rest, 0)

    if (body === null) {
      break
    }

    const end = rest.indexOf(FENCE_END, body)
    const blocks = end === -1 ? null : parseBlocks(rest.slice(body + 1, end))

    if (!blocks) {
      break
    }

    parts.push({ kind: "text", text: rest.slice(0, body - FENCE.length) })
    parts.push({ kind: "ui", blocks })
    rest = rest.slice(end + FENCE_END.length)
  }

  parts.push({ kind: "text", text: rest })

  return parts.filter(p => p.kind === "ui" || p.text.trim())
}

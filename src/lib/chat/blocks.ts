import type { UIMessage } from "ai"
import { z } from "zod"

const label = z.string().trim().min(1).max(80)

const text = z.string().trim().min(1).max(600)

const title = label.optional()

const link = z.httpUrl().max(2_000)

const vector = z.array(z.number()).length(3)

export const SHAPES = [
  "box",
  "sphere",
  "cylinder",
  "cone",
  "torus",
  "plane",
] as const

export const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("card"), title: label, body: text }),
  z.object({
    type: z.literal("keyvalue"),
    title,
    items: z
      .array(z.object({ key: label, value: text }))
      .min(1)
      .max(20),
  }),
  z.object({
    type: z.literal("table"),
    title,
    columns: z.array(label).min(1).max(6),
    rows: z
      .array(z.array(z.string().max(200)).max(6))
      .min(1)
      .max(30),
  }),
  z.object({
    type: z.literal("list"),
    title,
    items: z.array(text).min(1).max(20),
  }),
  z.object({
    type: z.literal("bar"),
    title,
    unit: z.string().max(12).optional(),
    bars: z
      .array(z.object({ label, value: z.number() }))
      .min(1)
      .max(12),
  }),
  z.object({ type: z.literal("image"), url: link, alt: label }),
  z.object({
    type: z.literal("scene"),
    title,
    objects: z
      .array(
        z.object({
          shape: z.enum(SHAPES),
          position: vector.describe("x, y, z; y is up"),
          size: vector.optional().describe("width, height, depth; default 1"),
          rotation: vector.optional().describe("degrees around x, y, z"),
          color: z
            .string()
            .regex(/^#[0-9a-f]{6}$/i)
            .optional(),
          label: label.optional(),
        }),
      )
      .min(1)
      .max(80),
  }),
  z.object({
    type: z.literal("actions"),
    title,
    buttons: z
      .array(
        z.object({
          label,
          reply: text.describe("Sent back as the user's message when pressed"),
        }),
      )
      .min(1)
      .max(6),
  }),
  z.object({
    type: z.literal("form"),
    title,
    submit: label,
    fields: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(40),
          label,
          kind: z.enum(["text", "number", "select", "check"]),
          options: z.array(label).max(20).optional(),
          required: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(12),
  }),
  z.object({
    type: z.literal("query"),
    title,
    source: z.string().trim().min(1).max(64).describe("Datasource name"),
    sql: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .describe("One read-only SELECT statement with ? placeholders"),
    params: z
      .array(z.union([z.string(), z.number(), z.null()]))
      .max(20)
      .optional(),
  }),
  z.object({
    type: z.literal("html"),
    title,
    html: z.string().min(1).max(200_000),
  }),
  z.object({
    type: z.literal("file"),
    title,
    path: z.string().min(1).max(1_000),
  }),
  z.object({
    type: z.literal("links"),
    title,
    links: z
      .array(z.object({ label, url: link }))
      .min(1)
      .max(6),
  }),
])

export type Block = z.infer<typeof block>

export type AnswersBlock = {
  type: "answers"
  items: { question: string; answer: string }[]
}

export type ShownBlock = Block | AnswersBlock

export const SHOW_UI = "show_ui"

export const showUiInput = z.object({
  blocks: z.array(block).min(1).max(6).describe("Blocks shown top to bottom."),
})

const showUiPart = z.object({
  type: z.literal(`tool-${SHOW_UI}`),
  state: z.enum(["input-available", "output-available"]),
  input: showUiInput,
})

export const uiBlocksIn = (input: unknown) => {
  const parsed = showUiInput.safeParse(input)

  return parsed.success ? parsed.data.blocks : null
}

export const isShowUi = (name: string) => name.includes(SHOW_UI)

export const blocksOf = (part: UIMessage["parts"][number]) => {
  const parsed = showUiPart.safeParse(part)

  return parsed.success ? parsed.data.input.blocks : null
}

export const UI_INSTRUCTIONS = [
  "## Generative UI",
  `When a visual view helps more than prose (a comparison table, a chart of numbers, key facts, a set of links), call ${SHOW_UI}. Keep using markdown for ordinary answers.`,
  "For a 3D layout, model or spatial explanation, use a scene block built from primitive shapes. Keep units consistent and y pointing up.",
  "To show live data stored in an Atrix datasource, use a query block with one SELECT statement; it re-runs every time the view or saved app opens.",
  "To ask the user to choose or fill something in, use an actions block (buttons whose reply is sent back as the user's message) or a form block (its answers come back as one message).",
].join("\n")

const UI_FENCE = "```atrix-ui"

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

const fenceAt = (text: string) => {
  for (
    let at = text.indexOf(UI_FENCE);
    at !== -1;
    at = text.indexOf(UI_FENCE, at + 1)
  ) {
    const after = text.slice(at + UI_FENCE.length)
    const lineStart = at === 0 || text[at - 1] === "\n"
    const opens = after.startsWith("\n") || after.startsWith("\r\n")

    if (lineStart && opens) {
      return at
    }
  }

  return -1
}

export const splitUi = (text: string): TextPart[] => {
  const parts: TextPart[] = []
  let rest = text

  for (;;) {
    const start = fenceAt(rest)
    const body = start === -1 ? -1 : rest.indexOf("\n", start)
    const end = body === -1 ? -1 : rest.indexOf(FENCE_END, body)
    const blocks = end === -1 ? null : parseBlocks(rest.slice(body + 1, end))

    if (!blocks) {
      break
    }

    parts.push(
      { kind: "text", text: rest.slice(0, start) },
      { kind: "ui", blocks },
    )
    rest = rest.slice(end + FENCE_END.length)
  }

  parts.push({ kind: "text", text: rest })

  return parts.filter(p => p.kind === "ui" || p.text.trim())
}

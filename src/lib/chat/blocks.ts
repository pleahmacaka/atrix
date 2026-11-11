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
    type: z.literal("links"),
    title,
    links: z
      .array(z.object({ label, url: link }))
      .min(1)
      .max(6),
  }),
])

export type Block = z.infer<typeof block>

export const SHOW_UI = "show_ui"

export const showUiInput = z.object({
  blocks: z.array(block).min(1).max(6).describe("Blocks shown top to bottom."),
})

const showUiPart = z.object({
  type: z.literal(`tool-${SHOW_UI}`),
  state: z.enum(["input-available", "output-available"]),
  input: showUiInput,
})

export const blocksOf = (part: UIMessage["parts"][number]) => {
  const parsed = showUiPart.safeParse(part)

  return parsed.success ? parsed.data.input.blocks : null
}

export const UI_INSTRUCTIONS = [
  "## Generative UI",
  `When a visual view helps more than prose (a comparison table, a chart of numbers, key facts, a set of links), call ${SHOW_UI}. Keep using markdown for ordinary answers.`,
  "For a 3D layout, model or spatial explanation, use a scene block built from primitive shapes. Keep units consistent and y pointing up.",
].join("\n")

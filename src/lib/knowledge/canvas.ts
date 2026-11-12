import { z } from "zod"

const color = z.string().optional()

const box = {
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  color,
}

export const canvasNode = z.discriminatedUnion("type", [
  z.object({ ...box, type: z.literal("text"), text: z.string() }),
  z.object({
    ...box,
    type: z.literal("file"),
    file: z.string(),
    subpath: z.string().optional(),
  }),
  z.object({ ...box, type: z.literal("link"), url: z.string() }),
  z.object({ ...box, type: z.literal("group"), label: z.string().optional() }),
])

const side = z.enum(["top", "right", "bottom", "left"]).optional()

export const canvasEdge = z.object({
  id: z.string(),
  fromNode: z.string(),
  toNode: z.string(),
  fromSide: side,
  toSide: side,
  fromEnd: z.enum(["none", "arrow"]).optional(),
  toEnd: z.enum(["none", "arrow"]).optional(),
  color,
  label: z.string().optional(),
})

export const canvas = z.object({
  nodes: z.array(canvasNode).default([]),
  edges: z.array(canvasEdge).default([]),
})

export type Canvas = z.infer<typeof canvas>

export type CanvasNode = z.infer<typeof canvasNode>

export const fileOf = (docId: string) => `${docId}.md`

export const docOf = (file: string) => file.replace(/\.md$/, "")

import type { Block, ShownBlock } from "#lib/chat/blocks.ts"

export { BUBBLE } from "./bubble.ts"

export const CARD = "min-w-0 rounded-box border border-base-300 bg-base-100 p-4"

export const titleOf = (block: ShownBlock) =>
  "title" in block && typeof block.title === "string" ? block.title : ""

export const blockBlocks = (blocks: ShownBlock[]) =>
  blocks.filter((b): b is Block => b.type !== "answers")

export const proportion = (value: number, values: number[]) => {
  const top = Math.max(...values.map(Math.abs))

  return top > 0 ? (Math.abs(value) / top) * 100 : 0
}

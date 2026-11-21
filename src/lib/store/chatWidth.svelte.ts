import { z } from "zod"
import type { Bounds } from "./settings.svelte.ts"
import { Stored } from "./stored.svelte.ts"

export const CHAT_WIDTH: Bounds = { min: 32, max: 120, step: 4, base: 48 }

const stored = new Stored("chat-width:", 0, z.number())

export const chatWidth = () => stored.get("column") || CHAT_WIDTH.base

export const setChatWidth = (rem: number) =>
  stored.set(
    "column",
    Math.round(Math.min(CHAT_WIDTH.max, Math.max(CHAT_WIDTH.min, rem))),
  )

$effect.root(() => {
  $effect(() => {
    document.documentElement.style.setProperty(
      "--chat-width",
      `${chatWidth()}rem`,
    )
  })
})

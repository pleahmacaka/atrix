import { createSubscriber } from "svelte/reactivity"
import type { OrbState } from "svelte-thinking-orbs"
import { z } from "zod"
import { type ChatItem, splitContext, type TextItem } from "#lib/acp/items.ts"
import { plainText } from "#lib/chat/plain.ts"
import { m } from "#lib/paraglide/messages.js"
import { Stored } from "#lib/store/stored.svelte.ts"
import { conversation } from "./conversation.svelte.ts"
import { voice } from "./voice.svelte.ts"

export type CallState = {
  orb: OrbState
  status: string
  said: string
  reply: string
  hearing: boolean
  muted: boolean
  quiet: boolean
  thinking: boolean
  failed: boolean
  level: number
}

export type CallCommand = "mute" | "end" | "open" | "toggle" | "ready"

export type CallSync = {
  call: CallState
  collapsed: boolean
  theme: string
  ink: string
}

export const replyOf = (list: ChatItem[]) => {
  const asked = list.findLastIndex(i => i.type === "user")

  return list
    .slice(asked + 1)
    .flatMap(i => (i.type === "agent" ? [i.text] : []))
    .join("\n\n")
}

const statusOf = (
  hearing: boolean,
  speaking: boolean,
  thinking: boolean,
  converting: boolean,
  muted: boolean,
) => {
  if (hearing) {
    return m.voice_listening()
  }

  if (speaking) {
    return m.voice_speaking()
  }

  if (thinking) {
    return converting ? m.voice_transcribing() : m.voice_thinking()
  }

  return muted ? m.voice_muted() : m.voice_listening()
}

export const callState = (running: boolean, items: ChatItem[]): CallState => {
  const thinking =
    !conversation.hearing &&
    !voice.speaking &&
    (running ||
      conversation.waiting ||
      conversation.holding ||
      conversation.transcribing > 0)

  const converting = conversation.transcribing > 0 || conversation.holding
  const status = statusOf(
    conversation.hearing,
    voice.speaking,
    thinking,
    converting,
    conversation.muted,
  )
  const asked = items.findLast((i): i is TextItem => i.type === "user")

  return {
    orb: voice.speaking ? "composing" : thinking ? "working" : "listening",
    status,
    said:
      conversation.hearing || conversation.heard
        ? conversation.heard
        : asked
          ? plainText(splitContext(asked.text).text)
          : "",
    reply:
      voice.speaking && voice.spoken ? voice.spoken : plainText(replyOf(items)),
    hearing: conversation.hearing,
    muted: conversation.muted,
    quiet: conversation.muted && !voice.speaking,
    thinking,
    failed: !!conversation.error,
    level: conversation.level,
  }
}

const root = document.documentElement

const watchTheme = createSubscriber(update => {
  const observer = new MutationObserver(update)

  observer.observe(root, {
    attributes: true,
    attributeFilter: ["data-theme", "style"],
  })

  return () => observer.disconnect()
})

const inkOf = () => {
  watchTheme()

  return getComputedStyle(root).getPropertyValue("--color-primary").trim()
}

export const palette = {
  get dark() {
    watchTheme()

    return root.dataset.theme === "atrix-dark"
  },

  get ink() {
    return inkOf()
  },
}

export const bubble = new Stored(
  "call-bubble:",
  null,
  z.object({ x: z.number(), y: z.number() }).nullable(),
)

export const folded = new Stored("call-folded:", false, z.boolean())

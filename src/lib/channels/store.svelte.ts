import { Channel } from "@tauri-apps/api/core"
import { z } from "zod"
import { native } from "#lib/native.ts"
import { persisted } from "#lib/store/stored.svelte.ts"

const bindingSchema = z.object({
  discordChannelId: z.string(),
  harness: z.string(),
  cwd: z.string(),
  sessionId: z.string().nullable(),
})

export type Binding = z.infer<typeof bindingSchema>

export type Incoming = {
  guild: string | null
  channelId: string
  channelName: string | null
  author: string
  authorId: string
  content: string
  messageId: string
  mentioned: boolean
}

type Frame =
  | { type: "ready"; user: string }
  | ({ type: "message" } & Incoming)
  | { type: "closed"; error: string | null }

const KEY = "channels"

const savedSchema = z.object({
  bindings: z.array(bindingSchema).catch([]),
  mentionOnly: z.boolean().catch(false),
  autostart: z.boolean().catch(false),
})

type Saved = z.infer<typeof savedSchema>

const load = () => persisted(KEY, savedSchema.parse({}), savedSchema)

export const channels = $state<
  Saved & {
    status: "off" | "connecting" | "on"
    user: string | null
    error: string | null
  }
>({ ...load(), status: "off", user: null, error: null })

export const saveChannels = () => {
  const { bindings, mentionOnly, autostart } = $state.snapshot(channels)

  localStorage.setItem(
    KEY,
    JSON.stringify({ bindings, mentionOnly, autostart }),
  )
}

export const isBound = (id: string) =>
  channels.bindings.some(b => b.discordChannelId === id)

export const sendToChannel = (channelId: string, text: string) =>
  native("channel_send", { channelId, text })

export const tokenPresent = () => native<boolean>("channel_token_present")

export const setToken = (token: string) =>
  native("channel_token_set", { token })

export const clearToken = () => native("channel_token_clear")

export const connectChannels = async (onMessage: (m: Incoming) => void) => {
  const sink = new Channel<Frame>(frame => {
    if (frame.type === "ready") {
      channels.status = "on"
      channels.user = frame.user
    } else if (frame.type === "closed") {
      channels.status = "off"
      channels.user = null
      channels.error = frame.error
    } else {
      onMessage(frame)
    }
  })

  channels.status = "connecting"
  channels.error = null

  try {
    await native("channel_start", { channel: sink })
  } catch (e) {
    channels.status = "off"
    throw e
  }

  channels.autostart = true
  saveChannels()
}

export const disconnectChannels = async () => {
  await native("channel_stop")
  channels.status = "off"
  channels.user = null
  channels.autostart = false
  saveChannels()
}

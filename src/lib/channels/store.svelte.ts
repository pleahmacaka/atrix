import { Channel } from "@tauri-apps/api/core"
import { z } from "zod"
import { native } from "#lib/native.ts"
import { persisted } from "#lib/store/stored.svelte.ts"

export type Incoming = {
  guild: string | null
  channelId: string
  channelName: string | null
  author: string
  authorId: string
  content: string
  messageId: string
}

type Frame =
  | { type: "ready"; user: string }
  | ({ type: "message" } & Incoming)
  | { type: "closed"; error: string | null }

export type Provider = {
  id: string
  name: string
  icon: string
  channelIcon: string
  numericChannel: boolean
  start: (sink: Channel<Frame>, owner: string) => Promise<unknown>
  stop: () => Promise<unknown>
  send: (channel: string, text: string) => Promise<unknown>
  tokenPresent: () => Promise<boolean>
  setToken: (token: string) => Promise<unknown>
  clearToken: () => Promise<unknown>
}

const discord: Provider = {
  id: "discord",
  name: "Discord",
  icon: "simple-icons:discord",
  channelIcon: "lucide:hash",
  numericChannel: true,
  start: (sink, owner) => native("channel_start", { channel: sink, owner }),
  stop: () => native("channel_stop"),
  send: (channelId, text) => native("channel_send", { channelId, text }),
  tokenPresent: () => native<boolean>("channel_token_present"),
  setToken: token => native("channel_token_set", { token }),
  clearToken: () => native("channel_token_clear"),
}

export const PROVIDERS: Provider[] = [discord]

export const providerOf = (id: string) =>
  PROVIDERS.find(p => p.id === id) ?? discord

const bindingSchema = z.preprocess(
  raw =>
    raw && typeof raw === "object" && "discordChannelId" in raw
      ? { provider: discord.id, channel: raw.discordChannelId, ...raw }
      : raw,
  z.object({
    provider: z.string(),
    channel: z.string(),
    harness: z.string(),
    cwd: z.string(),
    sessionId: z.string().nullable(),
  }),
)

export type Binding = z.infer<typeof bindingSchema>

const optionsSchema = z.object({
  ownerId: z.string().catch(""),
  autostart: z.boolean().catch(false),
})

export type ProviderOptions = z.infer<typeof optionsSchema>

const KEY = "channels"

const savedSchema = z.preprocess(
  raw =>
    raw && typeof raw === "object" && !("providers" in raw)
      ? { ...raw, providers: { [discord.id]: raw } }
      : raw,
  z.object({
    bindings: z.array(bindingSchema).catch([]),
    providers: z.record(z.string(), optionsSchema).catch({}),
  }),
)

type Saved = z.infer<typeof savedSchema>

export type Live = {
  status: "off" | "connecting" | "on"
  user: string | null
  error: string | null
}

const OFF: Live = { status: "off", user: null, error: null }

const load = (): Saved =>
  persisted(KEY, { bindings: [], providers: {} }, savedSchema)

export const channels = $state<Saved & { live: Record<string, Live> }>({
  ...load(),
  live: {},
})

export const liveOf = (provider: string) => channels.live[provider] ?? OFF

export const connected = (provider: string) => liveOf(provider).status === "on"

export const optionsOf = (provider: string): ProviderOptions =>
  channels.providers[provider] ?? { ownerId: "", autostart: false }

export const saveChannels = () => {
  const { bindings, providers } = $state.snapshot(channels)

  localStorage.setItem(KEY, JSON.stringify({ bindings, providers }))
}

export const setOptions = (
  provider: string,
  patch: Partial<ProviderOptions>,
) => {
  channels.providers[provider] = { ...optionsOf(provider), ...patch }
  saveChannels()
}

export const isOwnerId = (value: string) =>
  value.length >= 17 &&
  value.length <= 20 &&
  [...value].every(c => c >= "0" && c <= "9")

export const isBound = (channel: string) =>
  channels.bindings.some(b => b.channel === channel)

export const sendToChannel = (channel: string, text: string) => {
  const binding = channels.bindings.find(b => b.channel === channel)

  return providerOf(binding?.provider ?? discord.id).send(channel, text)
}

export const connectChannels = async (
  provider: Provider,
  onMessage: (m: Incoming) => void,
) => {
  const sink = new Channel<Frame>(frame => {
    if (frame.type === "ready") {
      channels.live[provider.id] = {
        status: "on",
        user: frame.user,
        error: null,
      }
    } else if (frame.type === "closed") {
      channels.live[provider.id] = {
        status: "off",
        user: null,
        error: frame.error,
      }
    } else {
      onMessage(frame)
    }
  })

  channels.live[provider.id] = { status: "connecting", user: null, error: null }

  try {
    await provider.start(sink, optionsOf(provider.id).ownerId)
  } catch (e) {
    channels.live[provider.id] = {
      ...OFF,
      error: e instanceof Error ? e.message : String(e),
    }
    throw e
  }

  setOptions(provider.id, { autostart: true })
}

export const disconnectChannels = async (provider: Provider) => {
  await provider.stop()
  channels.live[provider.id] = OFF
  setOptions(provider.id, { autostart: false })
}

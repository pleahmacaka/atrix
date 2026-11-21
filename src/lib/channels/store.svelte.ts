import { Channel } from "@tauri-apps/api/core"
import { z } from "zod"
import { native } from "#lib/native.ts"
import { persisted } from "#lib/store/stored.svelte.ts"

export type Incoming = {
  guild: string | null
  channelId: string
  channelName: string | null
  parentId: string | null
  direct: boolean
  author: string
  authorId: string
  content: string
  messageId: string
}

type Frame =
  | { type: "ready"; user: string }
  | ({ type: "message" } & Incoming)
  | { type: "closed"; error: string | null }

export type Reply = { mention: string; replyTo: string }

export type Provider = {
  id: string
  name: string
  icon: string
  channelIcon: string
  numericChannel: boolean
  start: (sink: Channel<Frame>, owner: string) => Promise<unknown>
  stop: () => Promise<unknown>
  send: (channel: string, text: string, to?: Reply) => Promise<unknown>
  typing: (channel: string) => Promise<unknown>
  botName: () => Promise<string>
  userName: (id: string) => Promise<string>
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
  send: (channelId, text, to) =>
    native("channel_send", {
      channelId,
      text,
      mention: to?.mention ?? null,
      replyTo: to?.replyTo ?? null,
    }),
  typing: channelId => native("channel_typing", { channelId }),
  botName: () => native<string>("channel_bot_name"),
  userName: userId => native<string>("channel_user_name", { userId }),
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

const botSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string().catch(discord.id),
  harness: z.string(),
  cwd: z.string(),
  model: z.string().catch(""),
  mode: z.string().catch(""),
  paused: z.boolean().catch(false),
  direct: z.boolean().catch(false),
  channels: z.array(z.string()).catch([]),
  members: z.array(z.string()).catch([]),
  sessions: z.record(z.string(), z.string()).catch({}),
  main: z.string().nullable().catch(null),
})

export type Bot = z.infer<typeof botSchema>

const requestSchema = z.object({
  bot: z.string(),
  userId: z.string(),
  name: z.string(),
  at: z.number(),
})

export type AccessRequest = z.infer<typeof requestSchema>

const botOf = (binding: Binding): Bot => ({
  id: crypto.randomUUID(),
  name: binding.channel,
  provider: binding.provider,
  harness: binding.harness,
  cwd: binding.cwd,
  model: "",
  mode: "",
  paused: false,
  direct: false,
  channels: [binding.channel],
  members: [],
  sessions: binding.sessionId ? { [binding.channel]: binding.sessionId } : {},
  main: null,
})

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
  z
    .object({
      bindings: z.array(bindingSchema).catch([]),
      bots: z.array(botSchema).optional(),
      requests: z.array(requestSchema).catch([]),
      providers: z.record(z.string(), optionsSchema).catch({}),
    })
    .transform(({ bindings, bots, requests, providers }) => ({
      bots: bots ?? bindings.map(botOf),
      requests,
      providers,
    })),
)

type Saved = z.infer<typeof savedSchema>

export type Live = {
  status: "off" | "connecting" | "on"
  user: string | null
  error: string | null
}

const OFF: Live = { status: "off", user: null, error: null }

const load = (): Saved =>
  persisted(KEY, { bots: [], requests: [], providers: {} }, savedSchema)

export const channels = $state<Saved & { live: Record<string, Live> }>({
  ...load(),
  live: {},
})

export const liveOf = (provider: string) => channels.live[provider] ?? OFF

export const connected = (provider: string) => liveOf(provider).status === "on"

export const optionsOf = (provider: string): ProviderOptions =>
  channels.providers[provider] ?? { ownerId: "", autostart: false }

export const saveChannels = () => {
  const { bots, requests, providers } = $state.snapshot(channels)

  localStorage.setItem(KEY, JSON.stringify({ bots, requests, providers }))
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

const botOfChannel = (channel: string) =>
  channels.bots.find(b => b.channels.includes(channel) || channel in b.sessions)

export const isBound = (channel: string) => !!botOfChannel(channel)

export const sendToChannel = (channel: string, text: string) =>
  providerOf(botOfChannel(channel)?.provider ?? discord.id).send(channel, text)

export const channelOfSession = (sessionId: string) => {
  for (const bot of channels.bots) {
    const channel = Object.entries(bot.sessions).find(
      ([, id]) => id === sessionId,
    )?.[0]

    if (channel) {
      return { bot, channel }
    }
  }

  return null
}

export const newBot = (name: string, harness: string, cwd: string): Bot => ({
  ...botOf({
    provider: discord.id,
    channel: "",
    harness,
    cwd,
    sessionId: null,
  }),
  name,
  channels: [],
})

export const saveBot = (bot: Bot) => {
  const before = channels.bots.find(b => b.id === bot.id)
  const moved =
    !!before && (before.harness !== bot.harness || before.cwd !== bot.cwd)
  const removed = new Set(
    before?.channels.filter(c => !bot.channels.includes(c)) ?? [],
  )
  const saved = moved
    ? { ...bot, main: null, sessions: {} }
    : {
        ...bot,
        sessions: Object.fromEntries(
          Object.entries(bot.sessions).filter(([c]) => !removed.has(c)),
        ),
      }

  channels.bots = [...channels.bots.filter(b => b.id !== bot.id), saved]
  saveChannels()
}

export const removeBot = (id: string) => {
  channels.bots = channels.bots.filter(b => b.id !== id)
  channels.requests = channels.requests.filter(r => r.bot !== id)
  saveChannels()
}

export const settleRequest = (request: AccessRequest, granted: boolean) => {
  const bot = channels.bots.find(b => b.id === request.bot)

  if (bot && granted && !bot.members.includes(request.userId)) {
    bot.members = [...bot.members, request.userId]
  }

  channels.requests = channels.requests.filter(
    r => r.bot !== request.bot || r.userId !== request.userId,
  )
  saveChannels()
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

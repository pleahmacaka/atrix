import { applyChoices } from "#lib/chat/choices.ts"
import { logFailure } from "#lib/logging.ts"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { isBusyError } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import {
  type Bot,
  channels,
  connectChannels,
  type Incoming,
  isOwnerId,
  optionsOf,
  PROVIDERS,
  type Provider,
  providerOf,
  saveChannels,
} from "./store.svelte.ts"

const queues = new Map<string, Promise<void>>()

const idle = (host: HostView, id: string) =>
  new Promise<void>(resolve => {
    const stop = $effect.root(() => {
      $effect(() => {
        if (!host.views[id]?.running) {
          resolve()
          queueMicrotask(() => stop())
        }
      })
    })
  })

const settled = (host: HostView, id: string, start: number) =>
  new Promise<void>(resolve => {
    let began = false
    const stop = $effect.root(() => {
      $effect(() => {
        const view = host.views[id]

        began ||= !!view?.running
        // prompt can return before running flips, so wait for the turn to start or land
        const landed = (view?.items.slice(start) ?? []).some(
          i => i.type !== "user",
        )

        if ((began || landed) && !view?.running) {
          resolve()
          queueMicrotask(() => stop())
        }
      })
    })
  })

const configure = async (host: HostView, bot: Bot, id: string) => {
  const mode = host.views[id]?.config.find(o => o.category === "mode")

  await applyChoices(host, id, {
    model: bot.model || undefined,
    options: mode && bot.mode ? { [mode.id]: bot.mode } : {},
  })
}

const opened = async (host: HostView, id: string | null | undefined) => {
  if (!id) {
    return null
  }

  if (host.views[id]) {
    return id
  }

  return host.open(id).then(
    () => id,
    () => null,
  )
}

export const sessionOf = async (
  host: HostView,
  bot: Bot,
  channel: string | null,
  channelName: string | null = null,
) => {
  const known = await opened(
    host,
    channel === null ? bot.main : bot.sessions[channel],
  )

  if (known) {
    return known
  }

  const id = await host.create(bot.harness, bot.cwd)

  await configure(host, bot, id).catch((e: unknown) =>
    logFailure("bot configure", e),
  )
  await host
    .rename(
      id,
      channel === null ? bot.name : `${bot.name} ${channelName ?? channel}`,
    )
    .catch(() => {})

  const current = channels.bots.find(b => b.id === bot.id)

  if (current) {
    if (channel === null) {
      current.main = id
    } else {
      current.sessions = { ...current.sessions, [channel]: id }
    }

    saveChannels()
  }

  return id
}

const TYPING_MS = 8000

const typing = (provider: Provider, channel: string) => {
  const ping = () =>
    provider.typing(channel).catch((e: unknown) => {
      clearInterval(timer)
      logFailure("channel typing", e)
    })

  const timer = setInterval(ping, TYPING_MS)

  ping()

  return () => clearInterval(timer)
}

const answer = async (host: HostView, bot: Bot, message: Incoming) => {
  const provider = providerOf(bot.provider)
  const id = await sessionOf(host, bot, message.channelId, message.channelName)
  const text = `${message.author}: ${message.content}`
  const stop = typing(provider, message.channelId)

  try {
    let start = 0

    for (;;) {
      await idle(host, id)
      start = host.views[id]?.items.length ?? 0

      try {
        await host.prompt(id, text)
        break
      } catch (e) {
        if (!isBusyError(e)) {
          throw e
        }
      }
    }

    await settled(host, id, start)

    const reply = (host.views[id]?.items.slice(start) ?? [])
      .flatMap(i => (i.type === "agent" ? [i.text.trim()] : []))
      .filter(Boolean)
      .join("\n\n")

    if (reply) {
      await provider.send(message.channelId, reply, {
        mention: message.authorId,
        replyTo: message.messageId,
      })
    }
  } finally {
    stop()
  }
}

const botForMessage = (provider: Provider, message: Incoming) =>
  channels.bots.find(
    b =>
      b.provider === provider.id &&
      (b.channels.includes(message.channelId) ||
        (!!message.parentId && b.channels.includes(message.parentId)) ||
        (message.direct && b.direct)),
  )

const allowed = (provider: Provider, bot: Bot, userId: string) =>
  userId === optionsOf(provider.id).ownerId || bot.members.includes(userId)

const ask = (bot: Bot, message: Incoming) => {
  const known = channels.requests.some(
    r => r.bot === bot.id && r.userId === message.authorId,
  )

  if (!known) {
    channels.requests = [
      ...channels.requests,
      {
        bot: bot.id,
        userId: message.authorId,
        name: message.author,
        at: Date.now(),
      },
    ]
    saveChannels()
  }

  return m.bot_access_requested({ bot: bot.name })
}

const receive = (provider: Provider) => (message: Incoming) => {
  const bot = botForMessage(provider, message)
  const host = hostById(LOCAL)

  if (!bot || !host || !message.content.trim()) {
    return
  }

  const to = { mention: message.authorId, replyTo: message.messageId }
  const notice = bot.paused
    ? m.bot_paused_reply({ bot: bot.name })
    : allowed(provider, bot, message.authorId)
      ? null
      : ask(bot, message)

  if (notice) {
    provider
      .send(message.channelId, notice, to)
      .catch((e: unknown) => logFailure("bot notice", e))

    return
  }

  const key = `${provider.id}:${message.channelId}`
  const next = (queues.get(key) ?? Promise.resolve())
    .then(() => answer(host, bot, message))
    .catch((e: unknown) => logFailure("bot relay", e))

  queues.set(key, next)
}

export const connect = (provider: Provider) =>
  connectChannels(provider, receive(provider))

export const startChannels = async () => {
  for (const provider of PROVIDERS) {
    const { autostart, ownerId } = optionsOf(provider.id)

    if (!autostart || !(await provider.tokenPresent())) {
      continue
    }

    if (!isOwnerId(ownerId)) {
      channels.live[provider.id] = {
        status: "off",
        user: null,
        error: "channel_owner_invalid",
      }
    } else {
      await connect(provider).catch((e: unknown) =>
        logFailure(`${provider.id} channel start`, e),
      )
    }
  }
}

import { logFailure } from "#lib/logging.ts"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { isBusyError } from "#lib/p2p/protocol.ts"
import {
  type Binding,
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

const sessionFor = async (host: HostView, binding: Binding) => {
  if (binding.sessionId && host.views[binding.sessionId]) {
    return binding.sessionId
  }

  if (binding.sessionId) {
    const opened = await host.open(binding.sessionId).then(
      () => true,
      () => false,
    )

    if (opened) {
      return binding.sessionId
    }
  }

  const id = await host.create(binding.harness, binding.cwd)

  binding.sessionId = id
  saveChannels()

  return id
}

const TYPING_MS = 8000

const typing = (binding: Binding) => {
  const provider = providerOf(binding.provider)
  const ping = () =>
    provider
      .typing(binding.channel)
      .catch((e: unknown) => logFailure("channel typing", e))

  ping()

  const timer = setInterval(ping, TYPING_MS)

  return () => clearInterval(timer)
}

const relay = async (binding: Binding, message: Incoming) => {
  const host = hostById(LOCAL)

  if (!host) {
    return
  }

  const stop = typing(binding)

  try {
    await answer(host, binding, message)
  } finally {
    stop()
  }
}

const answer = async (host: HostView, binding: Binding, message: Incoming) => {
  const id = await sessionFor(host, binding)
  const text = `${message.author}: ${message.content}`

  for (;;) {
    await idle(host, id)

    try {
      await host.prompt(id, text)
      break
    } catch (e) {
      if (!isBusyError(e)) {
        throw e
      }
    }
  }

  const start = host.views[id]?.items.length ?? 0

  await idle(host, id)

  const reply = (host.views[id]?.items.slice(start) ?? [])
    .flatMap(i => (i.type === "agent" ? [i.text.trim()] : []))
    .filter(Boolean)
    .join("\n\n")

  if (reply) {
    await providerOf(binding.provider).send(binding.channel, reply)
  }
}

const receive = (provider: Provider) => (message: Incoming) => {
  const binding = channels.bindings.find(
    b => b.provider === provider.id && b.channel === message.channelId,
  )

  if (!binding || !message.content.trim()) {
    return
  }

  const key = `${provider.id}:${binding.channel}`
  const next = (queues.get(key) ?? Promise.resolve())
    .then(() => relay(binding, message))
    .catch((e: unknown) => logFailure("channel relay", e))

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

import { Channel, isTauri } from "@tauri-apps/api/core"
import { z } from "zod"
import { messageOf, native } from "#lib/native.ts"
import { local } from "#lib/store/local.svelte.ts"

const info = z.object({
  name: z.string(),
  platform: z.string(),
  host: z.boolean(),
})

export type Info = z.infer<typeof info>

const peer = info.extend({
  id: z.string(),
  at: z.number(),
  removed: z.boolean(),
  seen: z.number(),
  online: z.boolean(),
})

export type Peer = z.infer<typeof peer>

const netEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("peers"), peers: z.array(peer) }),
  z.object({ type: z.literal("data"), from: z.string(), data: z.string() }),
  z.object({
    type: z.literal("request"),
    id: z.number(),
    from: z.string(),
    data: z.string(),
  }),
  z.object({ type: z.literal("paired"), id: z.string() }),
])

export type NetEvent = z.infer<typeof netEvent>

const pairing = z.object({ code: z.string(), expires: z.number() })

export type Pairing = z.infer<typeof pairing>

export type Transport = {
  start: (info: Info, on: (event: NetEvent) => void) => Promise<string>
  info: (info: Info) => Promise<void>
  send: (to: string | null, data: string) => Promise<void>
  request: (to: string, data: string) => Promise<string>
  reply: (id: number, data: string) => Promise<void>
  issue: (minutes: number) => Promise<Pairing>
  cancel: () => Promise<void>
  join: (code: string) => Promise<string>
  unpair: (id: string) => Promise<void>
}

const tauri: Transport = {
  start: (info, on) => native("net_start", { info, channel: new Channel(on) }),
  info: info => native("net_info", { info }),
  send: (to, data) => native("net_send", { to, data }),
  request: (to, data) => native("net_request", { to, data }),
  reply: (id, data) => native("net_reply", { id, data }),
  issue: minutes => native("net_issue", { minutes }),
  cancel: () => native("net_cancel"),
  join: code => native("net_join", { code }),
  unpair: id => native("net_unpair", { id }),
}

type WebNode = {
  id: () => string
  secret: () => Uint8Array
  next_event: () => Promise<string>
  set_info: (info: string) => void
  send: (to: string | undefined, data: string) => void
  request: (to: string, data: string) => Promise<string>
  reply: (id: number, data: string) => void
  issue: (minutes: number) => Promise<string>
  cancel: () => void
  join: (code: string) => Promise<string>
  unpair: (id: string) => void
}

type WebModule = {
  default: (options?: { module_or_path?: string }) => Promise<unknown>
  start: (
    secret: Uint8Array | undefined,
    peers: string,
    info: string,
  ) => Promise<WebNode>
}

const MODULE = "/net/atrix_web.js"

const RETRY_MS = 1000

const web = (): Transport => {
  let node: WebNode | null = null

  const ready = () => {
    if (!node) {
      throw new Error("net_stopped:")
    }

    return node
  }

  const run = async <T>(work: (node: WebNode) => T | Promise<T>) => {
    try {
      return await work(ready())
    } catch (e) {
      throw new Error(messageOf(e))
    }
  }

  const next = async (on: (event: NetEvent) => void) => {
    const event = netEvent.parse(JSON.parse(await ready().next_event()))

    if (event.type === "peers") {
      local.data.net = { ...local.data.net, peers: event.peers }
      await local.save()
    }

    on(event)
  }

  const pump = async (on: (event: NetEvent) => void) => {
    for (;;) {
      try {
        await next(on)
      } catch (e) {
        console.error("net event", e)
        await new Promise(resolve => setTimeout(resolve, RETRY_MS))
      }
    }
  }

  return {
    start: async (info, on) => {
      const mod = (await import(/* @vite-ignore */ MODULE)) as WebModule

      await mod.default()

      const saved = local.data.net
      const key = saved?.key ? Uint8Array.fromBase64(saved.key) : undefined

      node = await mod.start(
        key,
        JSON.stringify(saved?.peers ?? []),
        JSON.stringify(info),
      )
      local.data.net = {
        peers: saved?.peers ?? [],
        key: node.secret().toBase64(),
      }
      await local.save()
      pump(on)

      return node.id()
    },
    info: info => run(n => n.set_info(JSON.stringify(info))),
    send: (to, data) => run(n => n.send(to ?? undefined, data)),
    request: (to, data) => run(n => n.request(to, data)),
    reply: (id, data) => run(n => n.reply(id, data)),
    issue: minutes =>
      run(async n => pairing.parse(JSON.parse(await n.issue(minutes)))),
    cancel: () => run(n => n.cancel()),
    join: code => run(n => n.join(code)),
    unpair: id => run(n => n.unpair(id)),
  }
}

export const transport: Transport = isTauri() ? tauri : web()

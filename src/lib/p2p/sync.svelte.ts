import { SvelteMap } from "svelte/reactivity"
import { z } from "zod"
import type { Host } from "#lib/acp/host.ts"
import { logFailure } from "#lib/logging.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop, platform } from "#lib/platform.ts"
import { mergeGateways } from "#lib/store/gateways.svelte.ts"
import { local } from "#lib/store/local.svelte.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { HostView } from "./hostView.svelte.ts"
import { type NetEvent, type Pairing, type Peer, transport } from "./net.ts"
import {
  type Answers,
  type Frame,
  frame,
  hostRequest,
  type Op,
  type Reply,
  type RequestOf,
  reply,
} from "./protocol.ts"

const PAIR_MINUTES = 5

const parseRequest = (data: string) => {
  const parsed = hostRequest.safeParse(JSON.parse(data))

  if (!parsed.success) {
    throw new Error(`invalid_request: ${z.prettifyError(parsed.error)}`)
  }

  return parsed.data
}

class Sync {
  self = $state<string | null>(null)

  peers = new SvelteMap<string, Peer>()

  hosts = new SvelteMap<string, HostView>()

  pairing = $state<Pairing | null>(null)

  loaded = $state(false)

  #host: Host | null = null

  #started: Promise<string> | null = null

  #me = () => ({
    name: settings.deviceName,
    platform,
    host: desktop,
  })

  serve = (host: Host) => {
    this.#host = host
    host.network = {
      self: () => this.self,
      remotes: () =>
        [...this.hosts].map(([id, view]) => ({
          id,
          name: this.peers.get(id)?.name ?? id,
          call: view.call,
        })),
    }
    host.subscribe(event => {
      this.#post(null, { kind: "event", event })
    })
  }

  start = () => {
    this.#started ??= transport.start(this.#me(), this.#on).then(
      id => {
        this.self = id

        return id
      },
      e => {
        this.#started = null
        throw e
      },
    )

    return this.#started
  }

  connect = async (code: string) => {
    await this.start()
    await transport.join(code.trim())
  }

  issue = async (minutes = PAIR_MINUTES) => {
    await this.start()
    this.pairing = await transport.issue(minutes)
  }

  closePairing = async () => {
    this.pairing = null
    await transport.cancel().catch(() => {})
  }

  unpair = (id: string) => transport.unpair(id)

  announce = () => {
    transport.info(this.#me()).catch(() => {})
  }

  shareAuth = (target: string | null = null) => {
    this.#post(target, {
      kind: "gateways",
      gateways: $state.snapshot(local.data.gateways),
    })
  }

  call = async <K extends Op>(
    peerId: string,
    request: RequestOf<K>,
  ): Promise<Answers[K]> => {
    const answer = reply.parse(
      JSON.parse(await transport.request(peerId, JSON.stringify(request))),
    )

    if (!answer.ok) {
      throw new Error(answer.error)
    }

    return answer.value as Answers[K]
  }

  #post = (to: string | null, message: Frame) => {
    if (this.self) {
      transport.send(to, JSON.stringify(message)).catch(() => {})
    }
  }

  #on = (event: NetEvent) => {
    switch (event.type) {
      case "peers":
        this.#roster(event.peers)
        break
      case "paired":
        this.pairing = null
        break
      case "data":
        this.#received(event.from, event.data).catch(e =>
          logFailure("sync data", e),
        )
        break
      case "request":
        this.#serve(event.data).then(reply =>
          transport.reply(event.id, reply).catch(() => {}),
        )
        break
    }
  }

  #roster = (peers: Peer[]) => {
    this.loaded = true

    const current = new Set<string>()

    for (const peer of peers.filter(p => !p.removed)) {
      const was = this.peers.get(peer.id)

      current.add(peer.id)
      this.peers.set(peer.id, peer)

      if (peer.online && !was?.online) {
        this.shareAuth(peer.id)
      }

      if (!(peer.online && peer.host)) {
        this.hosts.delete(peer.id)
      } else if (!this.hosts.has(peer.id)) {
        const view = new HostView(peer.id, request =>
          this.call(peer.id, request),
        )

        this.hosts.set(peer.id, view)
        view.refresh().catch(e => logFailure("host refresh", e))
      }
    }

    for (const id of [...this.peers.keys()]) {
      if (!current.has(id)) {
        this.peers.delete(id)
        this.hosts.delete(id)
      }
    }
  }

  #received = async (from: string, data: string) => {
    const message = frame.parse(JSON.parse(data))

    if (message.kind === "event") {
      this.hosts.get(from)?.apply(message.event)

      return
    }

    const { changed, stale } = mergeGateways(message.gateways)

    if (changed) {
      await local.save()
    }

    if (stale) {
      this.shareAuth(from)
    }
  }

  #serve = async (data: string) => {
    let answer: Reply

    try {
      if (!this.#host) {
        throw new Error(m.sync_cannot_host())
      }

      answer = {
        ok: true,
        value: await this.#host.handle(parseRequest(data)),
      }
    } catch (e) {
      answer = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }

    return JSON.stringify(answer)
  }
}

export const sync = new Sync()

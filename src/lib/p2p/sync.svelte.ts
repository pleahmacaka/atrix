import { SvelteMap } from "svelte/reactivity"
import { joinRoom, type Room, selfId } from "trystero"
import type { Host } from "#lib/acp/host.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import {
  proofFor,
  randomBytes,
  sha256Hex,
  toBase64Url,
  toHex,
} from "#lib/store/crypto.ts"
import { mergeGateways } from "#lib/store/gateways.svelte.ts"
import { type Gateway, local } from "#lib/store/local.svelte.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { HostView } from "./hostView.svelte.ts"
import type { HostCall, HostEvent, HostRequest, Reply } from "./protocol.ts"
import { type Advert, type Link, tailnet, targetOf } from "./tailnet.svelte.ts"

const APP = "atrix"

const REQUEST_MS = 120_000

const PAIR_WAIT_MS = 30_000

const REDIAL_MS = 15_000

export const PAIR_CHOICES = [
  { minutes: 5, label: m.sync_minutes({ count: 5 }) },
  { minutes: 10, label: m.sync_minutes({ count: 10 }) },
  { minutes: 30, label: m.sync_minutes({ count: 30 }) },
  { minutes: 60, label: m.sync_hours({ count: 1 }) },
]

export type Pairing = { code: string; expires: number }

export type Peer = { id: string; name: string; host: boolean; tailnet?: Advert }

const handshake =
  (secret: string) =>
  async (
    peerId: string,
    send: (data: string) => Promise<void>,
    receive: () => Promise<{ data: unknown }>,
  ) => {
    const nonce = toHex(randomBytes(16))

    await send(nonce)

    const theirs = String((await receive()).data)

    await send(await proofFor(secret, theirs, selfId))

    const proof = String((await receive()).data)

    if (proof !== (await proofFor(secret, nonce, peerId))) {
      throw new Error(m.sync_mismatch())
    }
  }

const openRoom = async (kind: string, secret: string) =>
  joinRoom(
    { appId: APP, password: await sha256Hex(`atrix-${kind}-signal:${secret}`) },
    await sha256Hex(`atrix-${kind}-room:${secret}`),
    { onPeerHandshake: handshake(secret) },
  )

const parseCode = (code: string) => {
  const [token, stamp] = code.trim().split(".")
  const expires = Number.parseInt(stamp ?? "", 36)

  if (!token || !Number.isFinite(expires)) {
    throw new Error(m.sync_bad_code())
  }

  if (Date.now() >= expires) {
    throw new Error(m.sync_expired())
  }

  return { token, expires }
}

const receiveSecret = async (token: string, expires: number) => {
  const room = await openRoom("pair", token)
  const answer = Promise.withResolvers<string>()
  const timer = setTimeout(
    () => answer.reject(new Error(m.sync_no_issuer())),
    Math.min(PAIR_WAIT_MS, expires - Date.now()),
  )

  room.makeAction<string>("secret", { onMessage: answer.resolve })

  try {
    return await answer.promise
  } finally {
    clearTimeout(timer)
    await room.leave()
  }
}

class Sync {
  peers = new SvelteMap<string, Peer>()

  hosts = new SvelteMap<string, HostView>()

  joined = $state(false)

  pairing = $state<Pairing | null>(null)

  #room: Room | null = null

  #pairRoom: Room | null = null

  #pairTimer: ReturnType<typeof setTimeout> | null = null

  #hello: ((peer: Omit<Peer, "id">, target?: string) => Promise<void>) | null =
    null

  #auth: ((gateways: Gateway[], target?: string) => Promise<void>) | null = null

  #event: ((event: string) => Promise<void>) | null = null

  #request: ((request: string, target: string) => Promise<string>) | null = null

  #host: Host | null = null

  #links = new Map<string, Link>()

  #dialing = new Set<string>()

  #generation = 0

  serve = (host: Host) => {
    this.#host = host
    host.subscribe(event => {
      const data = JSON.stringify(event)

      this.#event?.(data)
      tailnet.emit(data)
    })
    tailnet
      .listen(this.#serve)
      .then(this.announce)
      .catch(() => {})
  }

  start = async () => {
    await this.#adopt(toBase64Url(randomBytes(32)))
  }

  connect = async (code: string) => {
    const { token, expires } = parseCode(code)

    await this.#adopt(await receiveSecret(token, expires))
  }

  stop = async () => {
    local.data.sync = null
    await local.save()
    await this.leave()
  }

  issue = async (minutes: number) => {
    const secret = local.data.sync

    if (!secret) {
      throw new Error(m.sync_not_set())
    }

    await this.closePairing()

    const token = toBase64Url(randomBytes(16))
    const expires = Date.now() + minutes * 60_000
    const room = await openRoom("pair", token)
    const give = room.makeAction<string>("secret")

    room.onPeerJoin = peerId => {
      if (Date.now() < expires) {
        give.send(secret, { target: peerId })
      }
    }

    this.#pairRoom = room
    this.#pairTimer = setTimeout(
      () => this.closePairing(),
      expires - Date.now(),
    )
    this.pairing = { code: `${token}.${expires.toString(36)}`, expires }
  }

  closePairing = async () => {
    if (this.#pairTimer) {
      clearTimeout(this.#pairTimer)
    }

    await this.#pairRoom?.leave()
    this.#pairRoom = null
    this.#pairTimer = null
    this.pairing = null
  }

  join = async (secret: string) => {
    await this.leave()

    const room = await openRoom("chain", secret)

    const hello = room.makeAction<Omit<Peer, "id">>("hello", {
      onMessage: (peer, { peerId }) => this.#greeted(peerId, peer),
    })
    const auth = room.makeAction<Gateway[]>("gateways", {
      onMessage: (gateways, { peerId }) => this.#received(gateways, peerId),
    })
    const event = room.makeAction<string>("event", {
      onMessage: (data, { peerId }) => {
        if (!this.#links.has(peerId)) {
          this.hosts.get(peerId)?.apply(JSON.parse(data) as HostEvent)
        }
      },
    })
    const request = room.makeAction<string, string>("request", {
      kind: "request",
      onRequest: data => this.#serve(data),
    })

    this.#hello = (peer, target) => hello.send(peer, { target })
    this.#auth = (gateways, target) => auth.send(gateways, { target })
    this.#event = data => event.send(data)
    this.#request = (data, target) =>
      request.request(data, { target, timeoutMs: REQUEST_MS })

    room.onPeerJoin = peerId => {
      this.#hello?.(this.#me(), peerId)
      this.shareAuth(peerId)
    }
    room.onPeerLeave = peerId => {
      if (!this.#links.has(peerId)) {
        this.peers.delete(peerId)
        this.hosts.delete(peerId)
      }
    }

    this.#room = room
    this.joined = true

    for (const entry of tailnet.servers) {
      this.dialServer(entry)
    }
  }

  leave = async () => {
    this.#generation++

    for (const link of this.#links.values()) {
      link.close()
    }

    this.#links.clear()
    await tailnet.revoke()
    await this.closePairing()
    await this.#room?.leave()
    this.#room = null
    this.#hello = this.#auth = this.#event = this.#request = null
    this.peers.clear()
    this.hosts.clear()
    this.joined = false
  }

  announce = () => {
    this.#hello?.(this.#me())
  }

  shareAuth = (target?: string) => {
    this.#auth?.($state.snapshot(local.data.gateways), target)
  }

  call = async (peerId: string, request: HostRequest) => {
    if (!this.#request) {
      throw new Error(m.sync_not_connected())
    }

    const reply = JSON.parse(
      await this.#request(JSON.stringify(request), peerId),
    ) as Reply

    if (!reply.ok) {
      throw new Error(reply.error)
    }

    return reply.value
  }

  #adopt = async (secret: string) => {
    local.data.sync = secret
    await local.save()
    await this.join(secret)
  }

  dialServer = (entry: string) => {
    const target = targetOf(entry, tailnet.port)

    if (this.joined && target) {
      this.#direct(target)
    }
  }

  #me = () => ({
    name: settings.deviceName,
    host: desktop,
    tailnet: tailnet.advert(),
  })

  #greeted = async (peerId: string, peer: Omit<Peer, "id">) => {
    this.peers.set(peerId, { id: peerId, ...peer })

    const settled =
      this.#links.has(peerId) ||
      this.#dialing.has(peerId) ||
      (this.hosts.has(peerId) && !peer.tailnet)

    if (!peer.host || settled) {
      return
    }

    const { addresses = [], port = 0 } = peer.tailnet ?? {}

    this.#dialing.add(peerId)

    for (const address of addresses) {
      const target = targetOf(address, port)

      if (target && (await this.#open(target, peerId))) {
        break
      }
    }

    this.#dialing.delete(peerId)

    if (!this.hosts.has(peerId)) {
      this.#attach(peerId, request => this.call(peerId, request))
    }
  }

  #attach = (id: string, call: HostCall) => {
    const view = new HostView(id, call)

    this.hosts.set(id, view)
    view.refresh().catch(() => {})
  }

  #open = async (target: string, expected: string | null) => {
    const generation = this.#generation
    let link: Link | null = null

    link = await tailnet
      .dial(target, expected, {
        event: (id, event) => this.hosts.get(id)?.apply(event),
        close: id => {
          if (this.#links.get(id) === link) {
            this.#closed(id, expected ? null : target)
          }
        },
      })
      .catch(() => null)

    if (!link) {
      return false
    }

    if (generation !== this.#generation || this.#links.has(link.id)) {
      link.close()

      return generation === this.#generation
    }

    this.#links.set(link.id, link)
    this.peers.set(link.id, {
      name: link.name,
      ...this.peers.get(link.id),
      id: link.id,
      host: true,
    })
    this.#attach(link.id, link.call)

    return true
  }

  #closed = (id: string, redial: string | null) => {
    const peer = this.peers.get(id)

    this.#links.delete(id)
    this.hosts.delete(id)

    if (peer && this.#room?.getPeers()[id]) {
      this.#greeted(id, peer)
    } else {
      this.peers.delete(id)
    }

    if (redial) {
      this.#redial(redial)
    }
  }

  #direct = async (target: string) => {
    if (!(await this.#open(target, null))) {
      this.#redial(target)
    }
  }

  #redial = (target: string) => {
    const generation = this.#generation

    setTimeout(() => {
      const wanted = tailnet.servers.some(
        s => targetOf(s, tailnet.port) === target,
      )

      if (generation === this.#generation && wanted) {
        this.#direct(target)
      }
    }, REDIAL_MS)
  }

  #received = async (gateways: Gateway[], peerId: string) => {
    const { changed, stale } = mergeGateways(gateways)

    if (changed) {
      await local.save()
    }

    if (stale) {
      this.shareAuth(peerId)
    }
  }

  #serve = async (data: string) => {
    let reply: Reply

    try {
      if (!this.#host) {
        throw new Error(m.sync_cannot_host())
      }

      reply = {
        ok: true,
        value: await this.#host.handle(JSON.parse(data) as HostRequest),
      }
    } catch (e) {
      reply = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }

    return JSON.stringify(reply)
  }
}

export const sync = new Sync()

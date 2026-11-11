import { SvelteMap } from "svelte/reactivity"
import { joinRoom, type Room, selfId } from "trystero"
import type { Host } from "#lib/acp/host.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import {
  randomBytes,
  sha256Hex,
  sign,
  toBase64Url,
  toHex,
} from "#lib/store/crypto.ts"
import { type Credential, local } from "#lib/store/local.svelte.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { HostView } from "./hostView.svelte.ts"
import type { HostEvent, HostRequest } from "./protocol.ts"

const APP = "atrix"

const REQUEST_MS = 120_000

const PAIR_WAIT_MS = 30_000

export const PAIR_CHOICES = [
  { minutes: 5, label: m.sync_minutes({ count: 5 }) },
  { minutes: 10, label: m.sync_minutes({ count: 10 }) },
  { minutes: 30, label: m.sync_minutes({ count: 30 }) },
  { minutes: 60, label: m.sync_hours({ count: 1 }) },
]

export type Pairing = { code: string; expires: number }

export type Peer = { id: string; name: string; host: boolean }

type Reply = { ok: true; value: unknown } | { ok: false; error: string }

const proofFor = (secret: string, nonce: string, prover: string) =>
  sign(secret, `${nonce}:${prover}`)

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

  #auth: ((credential: Credential, target?: string) => Promise<void>) | null =
    null

  #event: ((event: string) => Promise<void>) | null = null

  #request: ((request: string, target: string) => Promise<string>) | null = null

  #host: Host | null = null

  serve = (host: Host) => {
    this.#host = host
    host.subscribe(event => {
      this.#event?.(JSON.stringify(event))
    })
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
    const auth = room.makeAction<Credential>("auth", {
      onMessage: (credential, { peerId }) => this.#received(credential, peerId),
    })
    const event = room.makeAction<string>("event", {
      onMessage: (data, { peerId }) =>
        this.hosts.get(peerId)?.apply(JSON.parse(data) as HostEvent),
    })
    const request = room.makeAction<string, string>("request", {
      kind: "request",
      onRequest: data => this.#serve(data),
    })

    this.#hello = (peer, target) => hello.send(peer, { target })
    this.#auth = (credential, target) => auth.send(credential, { target })
    this.#event = data => event.send(data)
    this.#request = (data, target) =>
      request.request(data, { target, timeoutMs: REQUEST_MS })

    room.onPeerJoin = peerId => {
      this.#hello?.(this.#me(), peerId)
      this.shareAuth(peerId)
    }
    room.onPeerLeave = peerId => {
      this.peers.delete(peerId)
      this.hosts.delete(peerId)
    }

    this.#room = room
    this.joined = true
  }

  leave = async () => {
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
    this.#auth?.($state.snapshot(local.data.openrouter), target)
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

  #me = () => ({ name: settings.deviceName, host: desktop })

  #greeted = (peerId: string, peer: Omit<Peer, "id">) => {
    this.peers.set(peerId, { id: peerId, ...peer })

    if (peer.host && !this.hosts.has(peerId)) {
      const view = new HostView(peerId, request => this.call(peerId, request))

      this.hosts.set(peerId, view)
      view.refresh().catch(() => {})
    }
  }

  #received = async (credential: Credential, peerId: string) => {
    const mine = local.data.openrouter

    if (credential.at > mine.at) {
      local.data.openrouter = credential
      await local.save()
    } else if (credential.at < mine.at) {
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

import { Channel } from "@tauri-apps/api/core"
import { selfId } from "trystero"
import { native } from "#lib/acp/native.ts"
import { m } from "#lib/paraglide/messages.js"
import { proofFor, randomBytes, toBase64Url, toHex } from "#lib/store/crypto.ts"
import { local } from "#lib/store/local.svelte.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import type { HostCall, HostEvent, Reply } from "./protocol.ts"

export const DEFAULT_PORT = 4319

const HANDSHAKE_MS = 5000

const REQUEST_MS = 120_000

const NONCE_MS = 30_000

export type RuleMode = "all" | "allow" | "block"

export type TailnetAddress = { iface: string; address: string }

export type Advert = { addresses: string[]; port: number }

export type Link = {
  id: string
  name: string
  call: HostCall
  close: () => void
}

type Incoming = {
  id: number
  method: string
  url: string
  headers: [string, string][]
  body: string
}

type Answer = { status: number; body?: unknown }

const stored = <T>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key)

  return raw === null ? fallback : (JSON.parse(raw) as T)
}

const keep = (key: string, value: unknown) =>
  localStorage.setItem(key, JSON.stringify(value))

export const targetOf = (address: string, port: number) => {
  const host =
    address.split(":").length > 2 && !address.startsWith("[")
      ? `[${address}]`
      : address
  const url = URL.parse(`http://${host.trim()}`)

  if (url?.pathname !== "/") {
    return null
  }

  url.port = url.port || String(port)

  return url.origin
}

const BEARER = "Bearer "

const bearer = (headers: [string, string][]) => {
  const auth =
    headers.find(([k]) => k.toLowerCase() === "authorization")?.[1] ?? ""

  return auth.startsWith(BEARER) ? auth.slice(BEARER.length) : ""
}

const post = async (url: string, body: unknown, ms: number, token?: string) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `${BEARER}${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  })

  if (!response.ok) {
    throw new Error(m.tailnet_refused())
  }

  return response.json()
}

const opened = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error(m.tailnet_refused()))
  })

class Tailnet {
  port = $state(stored("tailnet-port", DEFAULT_PORT))

  mode = $state(stored<RuleMode>("tailnet-mode", "all"))

  rules = $state(stored<string[]>("tailnet-rules", []))

  servers = $state(stored<string[]>("tailnet-servers", []))

  detected = $state<TailnetAddress[]>([])

  bound = $state<string[]>([])

  #answer: ((request: string) => Promise<string>) | null = null

  #tokens = new Set<string>()

  #nonces = new Map<string, number>()

  setPort = (port: number) => {
    this.port = port
    keep("tailnet-port", port)
  }

  setMode = (mode: RuleMode) => {
    this.mode = mode
    keep("tailnet-mode", mode)
  }

  setRules = (rules: string[]) => {
    this.rules = rules
    keep("tailnet-rules", rules)
  }

  setServers = (servers: string[]) => {
    this.servers = servers
    keep("tailnet-servers", servers)
  }

  advert = (): Advert | undefined =>
    this.bound.length
      ? { addresses: [...this.bound], port: this.port }
      : undefined

  listen = async (answer: (request: string) => Promise<string>) => {
    this.#answer = answer
    await this.restart()
  }

  detect = async () => {
    this.detected = await native<TailnetAddress[]>("tailnet_addresses")
  }

  restart = async () => {
    await this.detect()

    if (!this.#answer) {
      return
    }

    this.#tokens.clear()

    const channel = new Channel<Incoming>(incoming => {
      this.#reply(incoming).catch(() => {})
    })

    this.bound = await native<string[]>("tailnet_start", {
      channel,
      port: this.port,
      rule: { mode: this.mode, list: $state.snapshot(this.rules) },
    })
  }

  revoke = async () => {
    if (this.#tokens.size) {
      await this.restart()
    }
  }

  emit = (event: string) => {
    if (this.#tokens.size) {
      native("tailnet_emit", { event }).catch(() => {})
    }
  }

  dial = async (
    target: string,
    expected: string | null,
    on: {
      event: (id: string, event: HostEvent) => void
      close: (id: string) => void
    },
  ): Promise<Link> => {
    const secret = local.data.sync

    if (!secret) {
      throw new Error(m.sync_not_set())
    }

    const challenge = toHex(randomBytes(16))
    const { nonce, id } = await post(`${target}/challenge`, {}, HANDSHAKE_MS)

    if (expected && id !== expected) {
      throw new Error(m.sync_mismatch())
    }

    const session = await post(
      `${target}/session`,
      {
        nonce,
        id: selfId,
        proof: await proofFor(secret, nonce, selfId),
        challenge,
      },
      HANDSHAKE_MS,
    )

    if (session.proof !== (await proofFor(secret, challenge, id))) {
      throw new Error(m.sync_mismatch())
    }

    const token = String(session.token)
    const events = new URL(`${target}/events`)

    events.protocol = "ws:"
    events.searchParams.set("token", token)

    const socket = new WebSocket(events)

    await opened(socket)
    socket.onmessage = e => on.event(id, JSON.parse(String(e.data)))
    socket.onclose = () => on.close(id)

    return {
      id,
      name: String(session.name),
      close: () => socket.close(),
      call: async request => {
        const reply = (await post(
          `${target}/request`,
          request,
          REQUEST_MS,
          token,
        )) as Reply

        if (!reply.ok) {
          throw new Error(reply.error)
        }

        return reply.value
      },
    }
  }

  #reply = async (incoming: Incoming) => {
    const { status, body } = await this.#route(incoming).catch(
      (e: unknown) => ({
        status: 400,
        body: { error: e instanceof Error ? e.message : String(e) },
      }),
    )

    await native("tailnet_reply", {
      id: incoming.id,
      status,
      body: body === undefined ? "" : JSON.stringify(body),
    })
  }

  #route = async ({
    method,
    url,
    headers,
    body,
  }: Incoming): Promise<Answer> => {
    const { pathname, searchParams } = new URL(url, "http://tailnet")
    const secret = local.data.sync

    if (!secret || !this.#answer) {
      return { status: 403 }
    }

    if (method === "GET" && pathname === "/events") {
      return {
        status: this.#tokens.has(searchParams.get("token") ?? "") ? 101 : 401,
      }
    }

    if (method !== "POST") {
      return { status: 405 }
    }

    switch (pathname) {
      case "/challenge":
        return { status: 200, body: { nonce: this.#nonce(), id: selfId } }
      case "/session":
        return this.#session(secret, JSON.parse(body))
      case "/request":
        return this.#tokens.has(bearer(headers))
          ? { status: 200, body: JSON.parse(await this.#answer(body)) }
          : { status: 401 }
      default:
        return { status: 404 }
    }
  }

  #nonce = () => {
    const now = Date.now()

    for (const [nonce, expires] of this.#nonces) {
      if (expires < now) {
        this.#nonces.delete(nonce)
      }
    }

    const nonce = toHex(randomBytes(16))

    this.#nonces.set(nonce, now + NONCE_MS)

    return nonce
  }

  #session = async (
    secret: string,
    claim: { nonce: string; id: string; proof: string; challenge: string },
  ): Promise<Answer> => {
    const expires = this.#nonces.get(claim.nonce) ?? 0

    this.#nonces.delete(claim.nonce)

    if (
      expires < Date.now() ||
      claim.proof !== (await proofFor(secret, claim.nonce, claim.id))
    ) {
      return { status: 401 }
    }

    const token = toBase64Url(randomBytes(32))

    this.#tokens.add(token)

    return {
      status: 200,
      body: {
        token,
        name: settings.deviceName,
        proof: await proofFor(secret, String(claim.challenge), selfId),
      },
    }
  }
}

export const tailnet = new Tailnet()

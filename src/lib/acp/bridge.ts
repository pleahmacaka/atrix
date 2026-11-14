import type { McpServer as Declaration } from "@agentclientprotocol/sdk"
import { createMcpHandler, type McpServer } from "@modelcontextprotocol/server"
import { Channel } from "@tauri-apps/api/core"
import { native } from "./native.ts"

type Incoming = {
  id: number
  method: string
  url: string
  headers: [string, string][]
  body: string
}

export type Caller = () => string | null

const BEARER = "Bearer "

const tokenOf = (headers: Headers) => {
  const auth = headers.get("authorization") ?? ""

  return auth.startsWith(BEARER) ? auth.slice(BEARER.length) : ""
}

export class Bridge {
  #tokens = new Map<string, string | null>()

  #port = 0

  #handler

  constructor(tools: (caller: Caller) => McpServer) {
    this.#handler = createMcpHandler(
      ({ requestInfo }) => {
        const token = requestInfo ? tokenOf(requestInfo.headers) : ""

        return tools(() => this.#tokens.get(token) ?? null)
      },
      { responseMode: "json" },
    )
  }

  start = async () => {
    const channel = new Channel<Incoming>(incoming => {
      this.#serve(incoming).catch(() => {})
    })

    this.#port = await native<number>("bridge_start", { channel })
  }

  declare = () => {
    const token = crypto.randomUUID()
    const server: Declaration = {
      type: "http",
      name: "atrix",
      url: `http://127.0.0.1:${this.#port}/mcp`,
      headers: [{ name: "Authorization", value: `${BEARER}${token}` }],
    }

    this.#tokens.set(token, null)

    return { token, servers: this.#port ? [server] : [] }
  }

  bind = (token: string, sessionId: string) => {
    this.#tokens.set(token, sessionId)
  }

  #serve = async ({ id, method, url, headers, body }: Incoming) => {
    const request = new Request(`http://127.0.0.1${url}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
    })
    const known = this.#tokens.has(tokenOf(request.headers))

    if (!known) {
      console.warn("mcp bridge rejected an unknown token", method, url)
    }

    const response = known
      ? await this.#handler.fetch(request)
      : new Response(null, { status: 401 })

    await native("bridge_reply", {
      id,
      status: response.status,
      headers: [...response.headers],
      body: await response.text(),
    })
  }
}

import * as acp from "@agentclientprotocol/sdk"
import { getVersion } from "@tauri-apps/api/app"
import { Channel } from "@tauri-apps/api/core"
import { native } from "#lib/native.ts"
import type { Attachment, ConfigChoice, Listed } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import type { Launch } from "./harnesses.ts"

type Frame = { type: "message"; message: acp.AnyMessage } | { type: "exit" }

export type Conn = {
  agent: acp.ClientContext
  info: { name: string; version: string } | null
  load: boolean
  list: boolean
  resume: boolean
  image: boolean
  embedded: boolean
  http: boolean
}

export type AgentEvents = {
  update: (sessionId: string, update: acp.SessionUpdate) => void
  permission: (
    params: acp.RequestPermissionRequest,
    signal: AbortSignal,
  ) => Promise<acp.RequestPermissionResponse>
  closed: () => void
}

const LIST_PAGES = 20

const MISSING_CWD = "`cwd` does not exist"

const spawnAgent = async (key: string, launch: Launch): Promise<acp.Stream> => {
  let reader: ReadableStreamDefaultController<acp.AnyMessage> | undefined

  const readable = new ReadableStream<acp.AnyMessage>({
    start: controller => {
      reader = controller
    },
  })

  const channel = new Channel<Frame>(frame => {
    if (frame.type === "message") {
      reader?.enqueue(frame.message)
    } else {
      reader?.close()
      reader = undefined
    }
  })

  const writable = new WritableStream<acp.AnyMessage>({
    write: message => native("agent_send", { key, message }),
  })

  await native("agent_spawn", { key, launch, channel })

  return { readable, writable }
}

export const connectAgent = async (
  key: string,
  launch: Launch,
  on: AgentEvents,
): Promise<Conn> => {
  const connection = acp
    .client({ name: "Atrix" })
    .onNotification(acp.methods.client.session.update, ({ params }) =>
      on.update(params.sessionId, params.update),
    )
    .onRequest(
      acp.methods.client.session.requestPermission,
      ({ params, signal }) => on.permission(params, signal),
    )
    .connect(await spawnAgent(key, launch))

  connection.closed.finally(on.closed)

  const init = await connection.agent.request(acp.methods.agent.initialize, {
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    },
    clientInfo: { name: "Atrix", version: await getVersion() },
  })
  const caps = init.agentCapabilities

  return {
    agent: connection.agent,
    info: init.agentInfo
      ? { name: init.agentInfo.name, version: init.agentInfo.version }
      : null,
    load: !!caps?.loadSession,
    list: !!caps?.sessionCapabilities?.list,
    resume: !!caps?.sessionCapabilities?.resume,
    image: !!caps?.promptCapabilities?.image,
    embedded: !!caps?.promptCapabilities?.embeddedContext,
    http: !!caps?.mcpCapabilities?.http,
  }
}

export const listSessions = async (conn: Conn): Promise<Listed[]> => {
  const sessions: acp.SessionInfo[] = []
  let cursor: string | null = null

  for (let page = 0; page < LIST_PAGES; page++) {
    const result: acp.ListSessionsResponse = await conn.agent.request(
      acp.methods.agent.session.list,
      cursor ? { cursor } : {},
    )

    sessions.push(...result.sessions)
    cursor = result.nextCursor ?? null

    if (!cursor) {
      break
    }
  }

  return sessions.map(s => ({
    sessionId: s.sessionId,
    cwd: s.cwd,
    title: s.title ?? "",
    updatedAt: s.updatedAt ?? null,
  }))
}

export const choicesOf = (config: acp.SessionConfigOption[]): ConfigChoice[] =>
  config.flatMap(o =>
    o.type === "select"
      ? [
          {
            id: o.id,
            name: o.name,
            category: o.category ?? null,
            current: String(o.currentValue),
            values: o.options
              .flatMap(v => ("group" in v ? v.options : [v]))
              .map(v => ({ value: v.value, name: v.name })),
          },
        ]
      : [],
  )

export const folderError = (e: unknown, cwd: string) =>
  e instanceof Error && e.message.includes(MISSING_CWD)
    ? new Error(m.error_folder_missing({ path: cwd }))
    : e

const attachmentBlock = (conn: Conn, a: Attachment): acp.ContentBlock => {
  if (a.kind === "image") {
    if (!conn.image) {
      throw new Error(m.error_attachment_image({ name: a.name }))
    }

    return { type: "image", data: a.data, mimeType: a.mimeType }
  }

  if (conn.embedded) {
    return {
      type: "resource",
      resource: {
        uri: `attachment:///${encodeURIComponent(a.name)}`,
        mimeType: a.mimeType,
        text: a.text,
      },
    }
  }

  return { type: "text", text: `${a.name}\n\n${a.text}` }
}

export const promptBlocks = (
  conn: Conn,
  text: string,
  attachments: Attachment[],
): acp.ContentBlock[] => [
  ...(text ? [{ type: "text" as const, text }] : []),
  ...attachments.map(a => attachmentBlock(conn, a)),
]

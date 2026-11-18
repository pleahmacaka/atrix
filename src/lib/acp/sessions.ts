import * as acp from "@agentclientprotocol/sdk"
import { homeDir } from "@tauri-apps/api/path"
import {
  channels,
  connected,
  sendToChannel,
} from "#lib/channels/store.svelte.ts"
import type { Block } from "#lib/chat/blocks.ts"
import { withoutInjected } from "#lib/chat/tags.ts"
import type { Actor } from "#lib/knowledge/document.ts"
import { logFailure } from "#lib/logging.ts"
import { native } from "#lib/native.ts"
import type {
  Ask,
  Attachment,
  Command,
  HarnessKind,
  HostEvent,
  Listed,
  OpenSession,
  Patch,
  SessionView,
} from "#lib/p2p/protocol.ts"
import { SESSION_BUSY, SESSION_GONE } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { settings } from "#lib/store/settings.svelte.ts"
import {
  type Conn,
  choicesOf,
  connectAgent,
  folderError,
  listSessions,
  promptBlocks,
} from "./agent.ts"
import type { Bridge } from "./bridge.ts"
import { applyUpdate, type Picked, shownInTurn } from "./items.ts"
import type { ExternalSessions } from "./mirror.ts"
import { type Harnesses, mirrorKind } from "./registry.ts"
import {
  forget,
  isNamed,
  keep,
  kept,
  optionsFor,
  remember,
  remembered,
  rename,
} from "./saved.ts"
import { SOURCES } from "./sources.ts"
import type { Reachable } from "./tools.ts"

const RESOURCE_NOT_FOUND = -32002

type Live = SessionView & {
  conn: Conn
  answer: ((optionId: string | null) => void) | null
  handback: boolean
}

type Spawned = { key: string; conn: Promise<Conn> }

export type SessionDeps = {
  harnesses: Harnesses
  external: ExternalSessions
  bridge: Bridge
  emit: (event: HostEvent) => void
  changed: () => void
  drain: (sessionId: string) => Promise<void>
  closed: (sessionId: string) => void
}

const TITLE_LIMIT = 60

const CANCELLED = { outcome: { outcome: "cancelled" as const } }

const CLAUDE_META = {
  claudeCode: { options: { extraArgs: { chrome: null } } },
}

const VENDORS: Record<HarnessKind, string> = {
  claude: "anthropic",
  codex: "openai",
}

const viewOf = ({
  conn: _conn,
  answer: _answer,
  handback: _handback,
  ...view
}: Live): SessionView => view

const summaryOf = (s: SessionView): OpenSession => ({
  id: s.id,
  harness: s.harness,
  cwd: s.cwd,
  title: s.title,
  running: s.running,
})

const categoryOf = (session: Live, configId: string) =>
  session.config.find(o => o.id === configId)?.category

const isModel = (session: Live, configId: string) =>
  categoryOf(session, configId) === "model"

const PINNED = new Set(["model", "thought_level"])

const isPinned = (session: Live, configId: string) =>
  !!session.pinned && PINNED.has(categoryOf(session, configId) ?? "")

export class Sessions {
  #conns = new Map<string, Spawned>()

  #retired = new Map<string, Conn>()

  #opening: string[] = []

  #pinned = new WeakMap<Conn, string>()

  #spawned = 0

  #listed = new Map<string, Listed[]>()

  #live = new Map<string, Live>()

  #taking = new Map<string, Promise<Live>>()

  #early = new Map<string, Command[]>()

  #usage = new Map<string, number>()

  #harnesses: Harnesses

  #external: ExternalSessions

  constructor(private readonly deps: SessionDeps) {
    this.#harnesses = deps.harnesses
    this.#external = deps.external
  }

  open = (): OpenSession[] =>
    [
      ...this.#live.values(),
      ...this.#external.views().filter(v => !this.#live.has(v.id)),
    ].map(summaryOf)

  reachable = (): Reachable[] =>
    this.open().map(s => ({
      id: s.id,
      title: s.title,
      harness: s.harness,
      running: s.running || this.busy(s.id),
    }))

  busy = (id: string) =>
    this.#taking.has(id) ||
    (this.#live.get(id)?.running ?? this.#external.busy(id))

  tokens = (id: string) =>
    this.#usage.get(id) ?? this.#external.get(id)?.tokens ?? 0

  release = async (harness: string) => {
    const known = this.#conns.get(harness)

    this.#conns.delete(harness)

    for (const key of this.#retired.keys()) {
      if (key.startsWith(`${harness}:`)) {
        this.#retired.delete(key)
        await native("agent_close", { key }).catch(e =>
          logFailure("harness close", e),
        )
      }
    }

    if (known) {
      await native("agent_close", { key: known.key })
    }
  }

  retire = (harness: string) => {
    const known = this.#conns.get(harness)

    this.#conns.delete(harness)

    known?.conn
      .then(conn => {
        this.#retired.set(known.key, conn)
        this.#reap()
      })
      .catch(() => null)
  }

  #reap = () => {
    const used = new Set([...this.#live.values()].map(s => s.conn))

    for (const [key, conn] of this.#retired) {
      if (!used.has(conn) && !this.#opening.includes(key)) {
        this.#retired.delete(key)
        native("agent_close", { key }).catch(e =>
          logFailure("harness close", e),
        )
      }
    }
  }

  list = async (harness: string): Promise<Listed[]> => {
    const { conn, done } = await this.#acquire(harness)

    try {
      return await this.#listOn(conn, harness)
    } finally {
      done()
    }
  }

  #acquire = async (harness: string) => {
    const spawned = this.#connect(harness)

    this.#opening.push(spawned.key)

    let held = true

    const done = () => {
      if (held) {
        held = false
        this.#opening.splice(this.#opening.indexOf(spawned.key), 1)
        this.#reap()
      }
    }

    try {
      return { conn: await spawned.conn, done }
    } catch (e) {
      done()
      throw e
    }
  }

  #listOn = async (conn: Conn, harness: string): Promise<Listed[]> => {
    if (!conn.list) {
      return []
    }

    const kind = mirrorKind(this.#harnesses.entry(harness))
    const live = kind ? (this.#external.listings.get(kind) ?? []) : []
    const listed = await listSessions(conn)

    listed.push(
      ...live.filter(l => !listed.some(s => s.sessionId === l.sessionId)),
    )
    this.#listed.set(harness, listed)

    return listed
  }

  create = async (harness: string, cwd: string) => {
    const { conn, done } = await this.#acquire(harness)

    try {
      const { token, servers } = this.deps.bridge.declare(conn.http)
      const created = await conn.agent.request(acp.methods.agent.session.new, {
        cwd,
        mcpServers: servers,
        _meta: CLAUDE_META,
      })

      return await this.#opened(conn, harness, cwd, token, created)
    } finally {
      done()
    }
  }

  #opened = async (
    conn: Conn,
    harness: string,
    cwd: string,
    token: string,
    created: acp.NewSessionResponse,
  ) => {
    const session = this.#register(conn, harness, created.sessionId, cwd)

    this.deps.bridge.bind(token, created.sessionId)

    session.config = choicesOf(created.configOptions ?? [])
    await this.#restore(session)
    keep({ harness, sessionId: session.id, cwd, title: session.title })
    this.deps.changed()

    return structuredClone(viewOf(session))
  }

  load = async (
    harness: string,
    sessionId: string,
    cwd: string,
    hint: string,
  ) => {
    await this.#external.ready

    const open = this.#live.get(sessionId)

    if (open) {
      return structuredClone(viewOf(open))
    }

    const source = mirrorKind(this.#harnesses.entry(harness))
    const title = () => this.#title(harness, sessionId) || hint
    const mirrored =
      !!this.#external.get(sessionId) || this.#external.live(sessionId)

    if (source && (mirrored || SOURCES[source].shared)) {
      const view = await this.#external.open(
        source,
        harness,
        sessionId,
        cwd,
        title(),
      )

      this.deps.changed()

      return structuredClone(view)
    }

    const { conn, done } = await this.#acquire(harness)

    let session: Live

    try {
      if (!conn.load) {
        throw new Error(m.error_no_load())
      }

      session = this.#register(conn, harness, sessionId, cwd, title())
    } finally {
      done()
    }

    try {
      await this.#attach(session, acp.methods.agent.session.load)
      await this.#restore(session)
    } catch (e) {
      this.#live.delete(sessionId)
      this.#reap()
      throw folderError(e, cwd)
    }

    keep({ harness, sessionId, cwd, title: session.title })
    this.deps.changed()

    return structuredClone(viewOf(session))
  }

  revive = async () => {
    for (const k of kept()) {
      try {
        await this.load(k.harness, k.sessionId, k.cwd, k.title)
      } catch (e) {
        if (
          this.#harnesses.find(k.harness) &&
          !this.#harnesses.disabled(k.harness)
        ) {
          forget(k.sessionId)
        }

        logFailure("session restore", e)
      }
    }
  }

  prompt = async (
    sessionId: string,
    text: string,
    attachments: Attachment[],
  ) => {
    if (!this.#live.has(sessionId) && this.#external.live(sessionId)) {
      await this.#external.type(sessionId, text, attachments)

      return null
    }

    const session = await this.#writable(sessionId).catch(
      async (e: unknown) => {
        if (e instanceof acp.RequestError && e.code === RESOURCE_NOT_FOUND) {
          await this.close(sessionId)
          throw new Error(SESSION_GONE)
        }

        throw e
      },
    )

    await this.#restore(session)

    if (session.running) {
      throw new Error(SESSION_BUSY)
    }

    const prompt = promptBlocks(session.conn, text, attachments)

    for (const content of prompt) {
      this.#apply(session, { sessionUpdate: "user_message_chunk", content })
    }

    const since = Date.now()

    this.#patch(session, {
      running: true,
      since,
      ...(!session.title && {
        title: withoutInjected(text).trim().slice(0, TITLE_LIMIT),
      }),
    })

    session.conn.agent
      .request(acp.methods.agent.session.prompt, { sessionId, prompt })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e)

        this.#update(sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `\n\n${m.chat_error({ message })}` },
        })
      })
      .finally(async () => {
        this.#patch(session, { running: false })

        if (session.handback && this.#external.live(session.id)) {
          await this.#handback(session)
        } else {
          session.handback = false
        }

        await this.deps.drain(sessionId).catch(() => {})
      })

    return null
  }

  permit = (sessionId: string, optionId: string | null) => {
    this.#session(sessionId).answer?.(optionId)
  }

  answer = (sessionId: string, toolId: string, answers: Picked[]) =>
    this.#external.answer(sessionId, toolId, answers)

  cancel = async (sessionId: string) => {
    if (!this.#live.has(sessionId) && this.#external.live(sessionId)) {
      await this.#external.interrupt(sessionId)

      return null
    }

    const session = this.#session(sessionId)

    session.answer?.(null)
    await session.conn.agent.notify(acp.methods.agent.session.cancel, {
      sessionId,
    })

    return null
  }

  close = async (sessionId: string) => {
    const session = this.#live.get(sessionId)

    this.#external.drop(sessionId)
    forget(sessionId)
    this.#usage.delete(sessionId)
    this.deps.closed(sessionId)

    if (session) {
      await this.#detach(session)
    }

    this.deps.changed()

    return null
  }

  configure = async (sessionId: string, configId: string, value: string) => {
    const session = this.#session(sessionId)

    if (session.pinned && isModel(session, configId)) {
      return null
    }

    const { configOptions } = await session.conn.agent.request(
      acp.methods.agent.session.setConfigOption,
      { sessionId, configId, value },
    )

    this.#patch(session, { config: choicesOf(configOptions) })

    if (!isPinned(session, configId)) {
      remember(session.harness, session.cwd, configId, value)
    }

    return null
  }

  rename = async (sessionId: string, title: string) => {
    const view = this.#live.get(sessionId) ?? this.#external.get(sessionId)

    if (!view) {
      throw new Error(m.error_session_not_found())
    }

    if (mirrorKind(this.#harnesses.entry(view.harness)) === "claude") {
      if (!this.#live.has(sessionId) && this.#external.live(sessionId)) {
        await this.#external.keys(sessionId, `/rename ${title}`)
      } else {
        const record = { type: "custom-title", customTitle: title, sessionId }

        await native("append_text", {
          path: await SOURCES.claude.locate(
            await homeDir(),
            sessionId,
            view.cwd,
          ),
          content: `${JSON.stringify(record)}
`,
        })
      }
    }

    this.retitle(sessionId, title)

    return null
  }

  retitle = (sessionId: string, title: string) => {
    const live = this.#live.get(sessionId)

    if (live) {
      this.#patch(live, { title })
    } else {
      this.deps.changed()
    }
  }

  show = (sessionId: string | null, blocks: Block[]) => {
    const session = sessionId ? this.#live.get(sessionId) : null

    if (!session || shownInTurn(session.items, blocks)) {
      return
    }

    session.items.push({ type: "ui", id: crypto.randomUUID(), blocks })
    this.#emitView(viewOf(session))
  }

  yieldToTerminals = async () => {
    for (const session of [...this.#live.values()]) {
      const kind = mirrorKind(this.#harnesses.find(session.harness))
      if (
        !kind ||
        !SOURCES[kind].shared ||
        this.busy(session.id) ||
        !this.#external.live(session.id)
      ) {
        continue
      }

      if (this.#external.get(session.id)) {
        await this.#handback(session)

        continue
      }

      this.#detach(session)

      const view = await this.#external.open(
        kind,
        session.harness,
        session.id,
        session.cwd,
        session.title,
      )

      this.#emitView(view)
    }
  }

  actorOf = (sessionId: string): Actor => {
    const live = this.#live.get(sessionId)
    const view = live ?? this.#external.get(sessionId)
    const entry = view ? this.#harnesses.find(view.harness) : undefined
    const vendor = entry?.kind ? VENDORS[entry.kind] : "unknown"
    const model = live?.config.find(o => o.category === "model")?.current

    return {
      kind: "agent",
      agent: view?.title || sessionId,
      session: `atrix:${sessionId}`,
      device: settings.deviceName || "unknown",
      harness: live?.conn.info ?? {
        name: entry?.base ?? "unknown",
        version: "unknown",
      },
      model: { id: model ?? "unknown", vendor },
      route: [{ kind: "provider", name: vendor }],
    }
  }

  #emitView = (view: SessionView) => {
    this.deps.emit({ type: "view", view: structuredClone(view) })
  }

  #patch = (session: Live, patch: Patch) => {
    Object.assign(session, patch)
    this.deps.emit({ type: "patch", sessionId: session.id, patch })

    if (patch.title) {
      rename(session.id, patch.title)
    }

    if ("running" in patch || "title" in patch) {
      this.deps.changed()
    }
  }

  #apply = (session: Live, update: acp.SessionUpdate) => {
    applyUpdate(session.items, update)
    this.deps.emit({ type: "update", sessionId: session.id, update })
  }

  #session = (id: string) => {
    const session = this.#live.get(id)

    if (!session) {
      throw new Error(m.error_session_not_found())
    }

    return session
  }

  #title = (harness: string, sessionId: string) =>
    this.#listed.get(harness)?.find(s => s.sessionId === sessionId)?.title ?? ""

  #connect = (harness: string) => {
    const known = this.#conns.get(harness)

    if (known) {
      return known
    }

    const key = `${harness}:${++this.#spawned}`
    const spawned: Spawned = {
      key,
      conn: this.#spawn(harness, key, () => this.#closed(harness, spawned)),
    }

    this.#conns.set(harness, spawned)
    spawned.conn.catch(() => this.#closed(harness, spawned))

    return spawned
  }

  #spawn = async (
    id: string,
    key: string,
    closed: () => void,
  ): Promise<Conn> => {
    if (this.#harnesses.disabled(id)) {
      throw new Error(m.error_harness_off())
    }

    const pinned = this.#harnesses.providedModel(id)
    const conn = await connectAgent(key, this.#harnesses.launchOf(id), {
      update: this.#update,
      permission: this.#permission,
      closed,
    })

    if (pinned) {
      this.#pinned.set(conn, pinned)
    }

    return conn
  }

  #closed = (harness: string, spawned: Spawned) => {
    if (this.#conns.get(harness) === spawned) {
      this.#conns.delete(harness)
    }

    this.#retired.delete(spawned.key)

    native("agent_close", { key: spawned.key }).catch(() => {})

    spawned.conn
      .then(
        conn => {
          for (const [id, session] of this.#live) {
            if (session.conn === conn) {
              session.answer?.(null)
              this.#live.delete(id)
            }
          }
        },
        () => {},
      )
      .finally(() => this.deps.changed())
  }

  #register = (
    conn: Conn,
    harness: string,
    id: string,
    cwd: string,
    title = "",
  ): Live => {
    const session: Live = {
      id,
      harness,
      cwd,
      title,
      running: false,
      items: [],
      ask: null,
      config: [],
      commands: this.#early.get(id) ?? [],
      conn,
      answer: null,
      handback: false,
      pinned: this.#pinned.get(conn),
    }

    this.#early.delete(id)
    this.#live.set(id, session)

    return session
  }

  #attach = async (
    session: Live,
    method:
      | typeof acp.methods.agent.session.load
      | typeof acp.methods.agent.session.resume,
  ) => {
    const { conn, id, cwd } = session
    const { token, servers } = this.deps.bridge.declare(conn.http)

    this.deps.bridge.bind(token, id)

    const attached = await conn.agent.request(method, {
      sessionId: id,
      cwd,
      mcpServers: servers,
      _meta: CLAUDE_META,
    })

    session.config = choicesOf(attached.configOptions ?? [])
  }

  #detach = async (session: Live) => {
    session.answer?.(null)
    this.#live.delete(session.id)

    const closed = await session.conn.agent
      .request(acp.methods.agent.session.close, { sessionId: session.id })
      .catch(() => null)

    this.#reap()

    return closed
  }

  #writable = async (sessionId: string) => {
    const taking = this.#taking.get(sessionId)

    if (taking) {
      return taking
    }

    const mirror = this.#external.get(sessionId)

    if (this.#live.has(sessionId) || !mirror) {
      return this.#session(sessionId)
    }

    if (this.#external.live(sessionId)) {
      throw new Error(m.chat_terminal_live())
    }

    const takeover = this.#takeover(sessionId, mirror)

    this.#taking.set(sessionId, takeover)

    try {
      return await takeover.finally(() => this.#taking.delete(sessionId))
    } catch (e) {
      this.deps.drain(sessionId).catch(() => {})
      throw e
    }
  }

  #takeover = async (sessionId: string, mirror: SessionView) => {
    this.#external.pause(sessionId)
    mirror.running = true
    this.#emitView(mirror)
    await this.#external.idle(sessionId)

    let session: Live | null = null

    try {
      const { conn, done } = await this.#acquire(mirror.harness)

      try {
        session = this.#register(
          conn,
          mirror.harness,
          sessionId,
          mirror.cwd,
          mirror.title,
        )
      } finally {
        done()
      }
      session.handback = true

      if (conn.resume) {
        session.items = structuredClone(mirror.items)
        await this.#attach(session, acp.methods.agent.session.resume)
      } else if (conn.load) {
        await this.#attach(session, acp.methods.agent.session.load)
      } else {
        throw new Error(m.error_no_load())
      }
    } catch (e) {
      this.#live.delete(sessionId)
      this.#reap()
      await this.#external.adopt(sessionId, mirror.items)
      throw folderError(e, mirror.cwd)
    }

    await this.#restore(session)
    this.#emitView(viewOf(session))

    return session
  }

  #handback = async (session: Live) => {
    this.#detach(session)
    await this.#external.adopt(session.id, session.items)
    this.deps.changed()
  }

  #restore = async (session: Live) => {
    const wanted = optionsFor(remembered(), session.harness, session.cwd)
    const order = (id: string) => (isModel(session, id) ? 0 : 1)
    const entries = Object.entries(wanted)
      .filter(([id]) => !isPinned(session, id))
      .toSorted(([a], [b]) => order(a) - order(b))

    let changed = false

    for (const [configId, value] of entries) {
      const option = session.config.find(o => o.id === configId)
      const valid = option?.values.some(v => v.value === value)

      if (!option || !valid || option.current === value) {
        continue
      }

      const result = await session.conn.agent
        .request(acp.methods.agent.session.setConfigOption, {
          sessionId: session.id,
          configId,
          value,
        })
        .catch(() => null)

      if (result) {
        session.config = choicesOf(result.configOptions)
        changed = true
      }
    }

    if (changed) {
      this.#patch(session, { config: session.config })
    }
  }

  #update = (sessionId: string, update: acp.SessionUpdate) => {
    const session = this.#live.get(sessionId)

    if (update.sessionUpdate === "available_commands_update") {
      const commands = update.availableCommands.map(c => ({
        name: c.name,
        description: c.description,
        hint: c.input?.hint,
      }))

      if (session) {
        this.#patch(session, { commands })
      } else {
        this.#early.set(sessionId, commands)
      }

      return
    }

    if (!session) {
      return
    }

    if (update.sessionUpdate === "usage_update") {
      this.#usage.set(sessionId, update.used)
      this.#patch(session, {
        context: { used: update.used, size: update.size },
      })
    }

    if (update.sessionUpdate === "config_option_update") {
      this.#patch(session, { config: choicesOf(update.configOptions) })
    } else if (update.sessionUpdate === "session_info_update") {
      if (update.title && !isNamed(sessionId)) {
        this.#patch(session, { title: update.title })
      }
    } else {
      this.#apply(session, update)
    }
  }

  #permission = async (
    params: acp.RequestPermissionRequest,
    signal: AbortSignal,
  ): Promise<acp.RequestPermissionResponse> => {
    const session = this.#live.get(params.sessionId)

    if (!session) {
      return CANCELLED
    }

    const ask: Ask = {
      title: params.toolCall.title ?? m.chat_tool_run(),
      options: params.options.map(o => ({
        optionId: o.optionId,
        name: o.name,
        kind: o.kind,
      })),
    }
    const optionId = await new Promise<string | null>(resolve => {
      session.answer = resolve
      signal.addEventListener("abort", () => resolve(null))
      this.#patch(session, { ask })
      this.#announce(session, ask)
    })

    session.answer = null
    this.#patch(session, { ask: null })

    return optionId
      ? { outcome: { outcome: "selected" as const, optionId } }
      : CANCELLED
  }

  #announce = (session: Live, ask: Ask) => {
    const open = channels.bindings.filter(b => connected(b.provider))
    const own = open.filter(b => b.sessionId === session.id)
    const targets = own.length > 0 ? own : open
    const text = m.channel_ask_notice({
      session: session.title || session.id,
      ask: ask.title,
    })

    for (const b of targets) {
      sendToChannel(b.channel, text).catch((e: unknown) =>
        logFailure("channel ask notice", e),
      )
    }
  }
}

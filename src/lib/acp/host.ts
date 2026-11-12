import * as acp from "@agentclientprotocol/sdk"
import { getVersion } from "@tauri-apps/api/app"
import { Channel } from "@tauri-apps/api/core"
import { homeDir } from "@tauri-apps/api/path"
import type { Actor } from "#lib/knowledge/document.ts"
import { Knowledge } from "#lib/knowledge/service.ts"
import type {
  Ask,
  Attachment,
  ConfigChoice,
  HarnessInfo,
  HostEvent,
  HostRequest,
  HostState,
  Listed,
  Patch,
  SessionView,
} from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { settings } from "#lib/store/settings.svelte.ts"
import { Bridge } from "./bridge.ts"
import {
  createProfileDir,
  envFor,
  KINDS,
  loadProfiles,
  type Profile,
  profileDir,
  readConfig,
  removeSkill,
  saveProfiles,
  type Target,
  writeDoc,
  writeSkill,
} from "./config.ts"
import { detectHarnesses, type Harness, type Launch } from "./harnesses.ts"
import { applyUpdate } from "./items.ts"
import { Postbox } from "./mail.ts"
import { ExternalSessions } from "./mirror.ts"
import { native } from "./native.ts"
import { SOURCES } from "./sources.ts"
import {
  atrixTools,
  type CreateArgs,
  type Message,
  type Reachable,
  type UpdateArgs,
} from "./tools.ts"

type Frame = { type: "message"; message: acp.AnyMessage } | { type: "exit" }

type Entry = Omit<HarnessInfo, "enabled"> & {
  launch: Launch
  dir: string | null
}

const DISABLED = "disabled-harnesses"

const REMEMBERED = "harness-options"

const remembered = (): Record<string, Record<string, string>> =>
  JSON.parse(localStorage.getItem(REMEMBERED) ?? "{}")

const remember = (harness: string, configId: string, value: string) => {
  const all = remembered()

  all[harness] = { ...all[harness], [configId]: value }
  localStorage.setItem(REMEMBERED, JSON.stringify(all))
}

const loadDisabled = () =>
  new Set<string>(JSON.parse(localStorage.getItem(DISABLED) ?? "[]"))

const PROFILE = "profile:"

type Conn = {
  agent: acp.ClientContext
  info: { name: string; version: string } | null
  load: boolean
  list: boolean
  resume: boolean
  image: boolean
  embedded: boolean
}

type Live = SessionView & {
  conn: Conn
  answer: ((optionId: string | null) => void) | null
  handback: boolean
}

const TITLE_LIMIT = 60

const LIST_PAGES = 20

const CANCELLED = { outcome: { outcome: "cancelled" as const } }

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

const choicesOf = (config: acp.SessionConfigOption[]): ConfigChoice[] =>
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

export class Host {
  #base: Harness[] = []

  #profiles: Profile[] = []

  #harnesses: Entry[] = []

  #disabled = loadDisabled()

  #external: ExternalSessions | null = null

  #home = ""

  #ready: Promise<void> | null = null

  #bridge = new Bridge(caller =>
    atrixTools(caller, {
      sessions: id => this.#reachable().filter(s => s.id !== id),
      send: (id, message) => this.#send(id, message),
      knowledge: {
        list: prefix =>
          this.#knowledge.store.list(prefix).map(e => ({
            id: e.meta.id,
            path: e.key,
            title: e.meta.title,
            tags: e.meta.tags,
            etag: e.etag,
          })),
        read: async ref => {
          const { meta, body, etag, key } =
            await this.#knowledge.store.read(ref)

          return { path: key, etag, frontmatter: meta, body }
        },
        history: ref => this.#knowledge.store.history(ref),
        create: (id, args) => this.#kgCreate(id, args),
        update: (id, args) => this.#kgUpdate(id, args),
        watch: (id, ref, on) => this.#knowledge.watch(id, ref, on),
      },
    }),
  )

  #knowledge = new Knowledge({
    emit: change => this.#emit({ type: "kg", change }),
    notify: (id, text) => {
      this.#postbox.notice(id, text).catch(() => {})
    },
    changed: () => this.#changed(),
  })

  #postbox = new Postbox(
    id =>
      this.#sessions.get(id)?.running ??
      this.#external?.presence.get(id) === true,
    (id, text) => this.#prompt(id, text, []),
  )

  #conns = new Map<string, Promise<Conn>>()

  #sessions = new Map<string, Live>()

  #listeners = new Set<(event: HostEvent) => void>()

  start = () => {
    this.#ready ??= (async () => {
      this.#home = await homeDir()
      this.#external = new ExternalSessions(
        this.#home,
        () => {
          this.#yield().catch(() => {})
          this.#changed()
        },
        view => {
          this.#emit({ type: "view", view: structuredClone(view) })
          this.#changed()
        },
      )
      this.#external.start()
      await this.#bridge.start().catch(() => {})
      this.#knowledge.start()
      this.#base = await detectHarnesses().catch(() => [])
      this.#profiles = await loadProfiles(this.#home).catch(() => [])
      await this.#build()
    })()

    return this.#ready
  }

  subscribe = (listener: (event: HostEvent) => void) => {
    this.#listeners.add(listener)

    return () => {
      this.#listeners.delete(listener)
    }
  }

  handle = async (request: HostRequest): Promise<unknown> => {
    await this.start()

    switch (request.op) {
      case "state":
        return this.#state()
      case "fs.browse":
        return native("browse_dirs", { path: request.path })
      case "list":
        return this.#list(request.harness)
      case "new":
        return this.#create(request.harness, request.cwd)
      case "load":
        return this.#load(request.harness, request.sessionId, request.cwd)
      case "prompt":
        return this.#prompt(
          request.sessionId,
          request.text,
          request.attachments,
        )
      case "cancel":
        return this.#cancel(request.sessionId)
      case "close":
        return this.#close(request.sessionId)
      case "permit":
        this.#session(request.sessionId).answer?.(request.optionId)

        return null
      case "harness.toggle":
        return this.#toggle(request.harness, request.enabled)
      case "harness.detect":
        this.#base = await detectHarnesses()
        await this.#build()
        this.#changed()

        return null
      case "harness.read":
        return readConfig(this.#target(request.harness))
      case "harness.write":
        await writeDoc(
          this.#target(request.harness),
          request.doc,
          request.content,
        )

        return null
      case "skill.write":
        await writeSkill(
          this.#target(request.harness),
          request.name,
          request.content,
        )

        return null
      case "skill.remove":
        await removeSkill(this.#target(request.harness), request.name)

        return null
      case "profile.create":
        return this.#createProfile(request.harness, request.name, request.fork)
      case "profile.remove":
        return this.#removeProfile(request.harness)
      case "option":
        return this.#configure(
          request.sessionId,
          request.configId,
          request.value,
        )
      case "kg.list":
      case "kg.canvases":
      case "kg.canvas.read":
      case "kg.canvas.save":
      case "kg.read":
      case "kg.history":
      case "kg.create":
      case "kg.update":
      case "kg.revert":
        return this.#knowledge.handle(request)
    }
  }

  #emit = (event: HostEvent) => {
    for (const listener of this.#listeners) {
      listener(event)
    }
  }

  #state = (): HostState => ({
    home: this.#home,
    harnesses: this.#harnesses.map(({ launch: _launch, dir: _dir, ...h }) => ({
      ...h,
      enabled: !this.#disabled.has(h.id),
    })),
    open: [
      ...this.#sessions.values(),
      ...(this.#external?.views() ?? []).filter(v => !this.#sessions.has(v.id)),
    ].map(s => ({
      id: s.id,
      harness: s.harness,
      cwd: s.cwd,
      title: s.title,
      running: s.running,
    })),
    knowledge: this.#knowledge.status,
    external: [...(this.#external?.presence ?? [])].map(([id, busy]) => ({
      id,
      busy,
    })),
  })

  #build = async () => {
    const base: Entry[] = this.#base.map(h => ({
      ...h,
      base: h.id,
      kind: KINDS[h.id] ?? null,
      profile: null,
      dir: null,
    }))
    const profiles = await Promise.all(
      this.#profiles.flatMap(p => {
        const parent = base.find(b => b.id === p.base)
        const kind = parent?.kind

        if (!parent || !kind) {
          return []
        }

        return [
          profileDir(this.#home, p.id).then(
            (dir): Entry => ({
              id: `${PROFILE}${p.id}`,
              name: `${parent.name} (${p.name})`,
              base: parent.id,
              kind,
              profile: p.name,
              dir,
              launch: {
                ...parent.launch,
                env: { ...parent.launch.env, ...envFor(kind, dir) },
              },
            }),
          ),
        ]
      }),
    )

    this.#harnesses = [...base, ...profiles]
  }

  #toggle = async (id: string, enabled: boolean) => {
    this.#entry(id)

    if (enabled) {
      this.#disabled.delete(id)
    } else {
      this.#disabled.add(id)
      this.#conns.delete(id)
      await native("agent_close", { key: id })
    }

    localStorage.setItem(DISABLED, JSON.stringify([...this.#disabled]))
    this.#changed()

    return null
  }

  #entry = (id: string) => {
    const entry = this.#harnesses.find(h => h.id === id)

    if (!entry) {
      throw new Error(m.error_harness_not_found())
    }

    return entry
  }

  #target = (id: string): Target => {
    const { kind, dir } = this.#entry(id)

    if (!kind) {
      throw new Error(m.error_harness_no_config())
    }

    return { kind, home: this.#home, dir }
  }

  #createProfile = async (harness: string, name: string, fork: boolean) => {
    const base = this.#entry(harness)
    const trimmed = name.trim()

    if (!base.kind || base.profile) {
      throw new Error(m.error_harness_no_profiles())
    }

    if (!trimmed) {
      throw new Error(m.error_profile_name())
    }

    const profile = { id: crypto.randomUUID(), base: base.id, name: trimmed }

    const dir = await profileDir(this.#home, profile.id)
    const skipped = await createProfileDir(
      base.kind,
      this.#home,
      dir,
      fork,
    ).catch(async (e: unknown) => {
      await native("remove_path", { path: dir })
      throw e
    })
    this.#profiles = [...this.#profiles, profile]
    await saveProfiles(this.#home, this.#profiles)
    await this.#build()
    this.#changed()

    const created = this.#state().harnesses.find(
      h => h.id === `${PROFILE}${profile.id}`,
    )

    return { harness: created, skipped }
  }

  #removeProfile = async (harness: string) => {
    const { dir, profile } = this.#entry(harness)

    if (!profile || !dir) {
      throw new Error(m.error_global_delete())
    }

    this.#conns.delete(harness)
    await native("agent_close", { key: harness })
    await native("remove_path", { path: dir })
    this.#profiles = this.#profiles.filter(p => `${PROFILE}${p.id}` !== harness)
    await saveProfiles(this.#home, this.#profiles)
    await this.#build()
    this.#changed()

    return null
  }

  #changed = () => {
    this.#emit({ type: "state", state: this.#state() })
  }

  #patch = (session: Live, patch: Patch) => {
    Object.assign(session, patch)
    this.#emit({ type: "patch", sessionId: session.id, patch })

    if ("running" in patch || "title" in patch) {
      this.#changed()
    }
  }

  #view = ({
    conn: _conn,
    answer: _answer,
    handback: _handback,
    ...view
  }: Live): SessionView => structuredClone(view)

  #session = (id: string) => {
    const session = this.#sessions.get(id)

    if (!session) {
      throw new Error(m.error_session_not_found())
    }

    return session
  }

  #connect = (harness: string) => {
    const known = this.#conns.get(harness)

    if (known) {
      return known
    }

    const conn = this.#open(harness)

    this.#conns.set(harness, conn)
    conn.catch(() => this.#conns.delete(harness))

    return conn
  }

  #open = async (id: string): Promise<Conn> => {
    const harness = this.#entry(id)

    if (this.#disabled.has(id)) {
      throw new Error(m.error_harness_off())
    }

    const connection = acp
      .client({ name: "Atrix" })
      .onNotification(acp.methods.client.session.update, ({ params }) =>
        this.#update(params.sessionId, params.update),
      )
      .onRequest(
        acp.methods.client.session.requestPermission,
        ({ params, signal }) => this.#permission(params, signal),
      )
      .connect(await spawnAgent(id, harness.launch))

    connection.closed.finally(() => {
      this.#conns.delete(id)

      for (const [key, session] of this.#sessions) {
        if (session.harness === id) {
          session.answer?.(null)
          this.#sessions.delete(key)
        }
      }

      this.#changed()
    })

    const init = await connection.agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: "Atrix", version: await getVersion() },
    })

    return {
      agent: connection.agent,
      info: init.agentInfo
        ? { name: init.agentInfo.name, version: init.agentInfo.version }
        : null,
      load: !!init.agentCapabilities?.loadSession,
      list: !!init.agentCapabilities?.sessionCapabilities?.list,
      resume: !!init.agentCapabilities?.sessionCapabilities?.resume,
      image: !!init.agentCapabilities?.promptCapabilities?.image,
      embedded: !!init.agentCapabilities?.promptCapabilities?.embeddedContext,
    }
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
      conn,
      answer: null,
      handback: false,
    }

    this.#sessions.set(id, session)

    return session
  }

  #list = async (harness: string): Promise<Listed[]> => {
    const conn = await this.#connect(harness)

    if (!conn.list) {
      return []
    }

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

  #create = async (harness: string, cwd: string) => {
    const conn = await this.#connect(harness)
    const { token, servers } = this.#bridge.declare()
    const created = await conn.agent.request(acp.methods.agent.session.new, {
      cwd,
      mcpServers: servers,
    })
    const session = this.#register(conn, harness, created.sessionId, cwd)

    this.#bridge.bind(token, created.sessionId)

    session.config = choicesOf(created.configOptions ?? [])
    await this.#restore(session)
    this.#changed()

    return this.#view(session)
  }

  #load = async (harness: string, sessionId: string, cwd: string) => {
    const open = this.#sessions.get(sessionId)

    if (open) {
      return this.#view(open)
    }

    const entry = this.#entry(harness)
    const mirrored = this.#external?.get(sessionId)
    const source = entry.profile ? null : entry.kind
    const elsewhere = !!source && this.#external?.presence.has(sessionId)

    if (this.#external && source && (mirrored || elsewhere)) {
      const listed = await this.#list(harness).catch(() => [])
      const title = listed.find(s => s.sessionId === sessionId)?.title ?? ""
      const view = await this.#external.open(
        source,
        harness,
        sessionId,
        cwd,
        title,
      )

      this.#changed()

      return structuredClone(view)
    }

    const conn = await this.#connect(harness)

    if (!conn.load) {
      throw new Error(m.error_no_load())
    }

    const listed = await this.#list(harness).catch(() => [])
    const title = listed.find(s => s.sessionId === sessionId)?.title ?? ""
    const session = this.#register(conn, harness, sessionId, cwd, title)

    try {
      const loaded = await conn.agent.request(acp.methods.agent.session.load, {
        sessionId,
        cwd,
        mcpServers: this.#mcp(sessionId),
      })

      session.config = choicesOf(loaded.configOptions ?? [])
      await this.#restore(session)
    } catch (e) {
      this.#sessions.delete(sessionId)
      throw e
    }

    this.#changed()

    return this.#view(session)
  }

  #update = (sessionId: string, update: acp.SessionUpdate) => {
    const session = this.#sessions.get(sessionId)

    if (!session) {
      return
    }

    if (update.sessionUpdate === "config_option_update") {
      this.#patch(session, { config: choicesOf(update.configOptions) })
    } else if (update.sessionUpdate === "session_info_update" && update.title) {
      this.#patch(session, { title: update.title })
    } else {
      applyUpdate(session.items, update)
      this.#emit({ type: "update", sessionId, update })
    }
  }

  #permission = async (
    params: acp.RequestPermissionRequest,
    signal: AbortSignal,
  ) => {
    const session = this.#sessions.get(params.sessionId)

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
    })

    session.answer = null
    this.#patch(session, { ask: null })

    return optionId
      ? { outcome: { outcome: "selected" as const, optionId } }
      : CANCELLED
  }

  #writable = async (sessionId: string) => {
    const open = this.#sessions.get(sessionId)
    const mirror = this.#external?.get(sessionId)

    if (open || !mirror || !this.#external) {
      return this.#session(sessionId)
    }

    const external = this.#external

    external.pause(sessionId)
    mirror.running = true
    this.#emit({ type: "view", view: structuredClone(mirror) })
    await external.idle(sessionId)

    const conn = await this.#connect(mirror.harness)
    const session = this.#register(
      conn,
      mirror.harness,
      sessionId,
      mirror.cwd,
      mirror.title,
    )

    session.handback = true

    try {
      if (conn.resume) {
        session.items = structuredClone(mirror.items)

        const resumed = await conn.agent.request(
          acp.methods.agent.session.resume,
          { sessionId, cwd: mirror.cwd, mcpServers: this.#mcp(sessionId) },
        )

        session.config = choicesOf(resumed.configOptions ?? [])
      } else if (conn.load) {
        const loaded = await conn.agent.request(
          acp.methods.agent.session.load,
          {
            sessionId,
            cwd: mirror.cwd,
            mcpServers: this.#mcp(sessionId),
          },
        )

        session.config = choicesOf(loaded.configOptions ?? [])
      } else {
        throw new Error(m.error_no_load())
      }
    } catch (e) {
      this.#sessions.delete(sessionId)
      await external.adopt(sessionId, mirror.items)
      throw e
    }

    await this.#restore(session)
    this.#emit({ type: "view", view: this.#view(session) })

    return session
  }

  #yield = async () => {
    const external = this.#external

    for (const session of [...this.#sessions.values()]) {
      const entry = this.#harnesses.find(h => h.id === session.harness)
      const kind = entry?.profile ? null : entry?.kind
      const idle = !session.running && !session.handback

      if (!kind || !external || !SOURCES[kind].shared || !idle) {
        continue
      }

      if (!external.presence.has(session.id)) {
        continue
      }

      this.#sessions.delete(session.id)
      session.answer?.(null)
      session.conn.agent
        .request(acp.methods.agent.session.close, { sessionId: session.id })
        .catch(() => {})

      const view = await external.open(
        kind,
        session.harness,
        session.id,
        session.cwd,
        session.title,
      )

      this.#emit({ type: "view", view: structuredClone(view) })
    }
  }

  #handback = async (session: Live) => {
    this.#sessions.delete(session.id)
    session.conn.agent
      .request(acp.methods.agent.session.close, { sessionId: session.id })
      .catch(() => {})
    await this.#external?.adopt(session.id, session.items)
    this.#changed()
  }

  #blocks = (
    conn: Conn,
    text: string,
    attachments: Attachment[],
  ): acp.ContentBlock[] => [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...attachments.map((a): acp.ContentBlock => {
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
    }),
  ]

  #prompt = async (
    sessionId: string,
    text: string,
    attachments: Attachment[],
  ) => {
    const session = await this.#writable(sessionId)
    const prompt = this.#blocks(session.conn, text, attachments)

    for (const content of prompt) {
      const update: acp.SessionUpdate = {
        sessionUpdate: "user_message_chunk",
        content,
      }

      applyUpdate(session.items, update)
      this.#emit({ type: "update", sessionId, update })
    }

    this.#patch(session, {
      running: true,
      ...(!session.title && { title: text.slice(0, TITLE_LIMIT) }),
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

        if (session.handback) {
          await this.#handback(session)
        }

        await this.#postbox.drain(sessionId).catch(() => {})
      })

    return null
  }

  #mcp = (sessionId: string) => {
    const { token, servers } = this.#bridge.declare()

    this.#bridge.bind(token, sessionId)

    return servers
  }

  #reachable = (): Reachable[] =>
    this.#state().open.map(s => ({
      id: s.id,
      title: s.title,
      harness: s.harness,
      running: s.running || this.#external?.presence.get(s.id) === true,
    }))

  #send = async (from: string, { to, text, thread, refs = [] }: Message) => {
    const all = this.#reachable()
    const wanted = to.trim().toLowerCase()
    const byTitle = all.filter(s => s.title.trim().toLowerCase() === wanted)
    const target =
      all.find(s => s.id === to) ?? (byTitle.length === 1 ? byTitle[0] : null)

    if (!target) {
      throw new Error(
        `unknown_session: no single session matches "${to}"; call list_sessions`,
      )
    }

    if (target.id === from) {
      throw new Error("self_message: a session cannot message itself")
    }

    const sender = all.find(s => s.id === from)?.title ?? from

    return this.#postbox.post({
      from,
      sender,
      to: target.id,
      thread,
      refs,
      text,
    })
  }

  #actorOf = (sessionId: string): Actor => {
    const live = this.#sessions.get(sessionId)
    const view = live ?? this.#external?.get(sessionId)
    const entry = this.#harnesses.find(h => h.id === view?.harness)
    const vendor =
      entry?.kind === "claude"
        ? "anthropic"
        : entry?.kind === "codex"
          ? "openai"
          : "unknown"
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

  #kgCreate = (sessionId: string, { path, body, ...fields }: CreateArgs) =>
    this.#knowledge.save(() =>
      this.#knowledge.store.create(
        path,
        {
          title: fields.title,
          description: fields.description ?? "",
          tags: fields.tags ?? [],
          scope: fields.scope ?? "network",
          links: fields.links ?? [],
        },
        body,
        this.#actorOf(sessionId),
      ),
    )

  #kgUpdate = (sessionId: string, { ref, etag, body, ...fields }: UpdateArgs) =>
    this.#knowledge.save(() =>
      this.#knowledge.store.update(
        ref,
        etag,
        { fields, body },
        this.#actorOf(sessionId),
      ),
    )

  #close = async (sessionId: string) => {
    const session = this.#sessions.get(sessionId)

    this.#external?.drop(sessionId)

    if (session) {
      session.answer?.(null)
      this.#sessions.delete(sessionId)
      await session.conn.agent
        .request(acp.methods.agent.session.close, { sessionId })
        .catch(() => null)
    }

    this.#changed()

    return null
  }

  #cancel = async (sessionId: string) => {
    const session = this.#session(sessionId)

    session.answer?.(null)
    await session.conn.agent.notify(acp.methods.agent.session.cancel, {
      sessionId,
    })

    return null
  }

  #restore = async (session: Live) => {
    const wanted = remembered()[session.harness] ?? {}
    const order = (id: string) =>
      session.config.find(o => o.id === id)?.category === "model" ? 0 : 1
    const entries = Object.entries(wanted).toSorted(
      ([a], [b]) => order(a) - order(b),
    )

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
      }
    }
  }

  #configure = async (sessionId: string, configId: string, value: string) => {
    const session = this.#session(sessionId)
    const { configOptions } = await session.conn.agent.request(
      acp.methods.agent.session.setConfigOption,
      { sessionId, configId, value },
    )

    this.#patch(session, { config: choicesOf(configOptions) })
    remember(session.harness, configId, value)

    return null
  }
}

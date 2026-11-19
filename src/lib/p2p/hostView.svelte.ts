import { get, set } from "idb-keyval"
import { SvelteSet } from "svelte/reactivity"
import { applyUpdate, type Picked } from "#lib/acp/items.ts"
import { forgetPrimer } from "#lib/chat/primer.ts"
import type { Canvas } from "#lib/knowledge/canvas.ts"
import type { Editable } from "#lib/knowledge/document.ts"
import { m } from "#lib/paraglide/messages.js"
import { settings } from "#lib/store/settings.svelte.ts"
import type {
  Attachment,
  CanvasEntry,
  Change,
  Entry,
  HostCall,
  HostEvent,
  HostState,
  InstallScope,
  KgPatch,
  Listed,
  ProviderChoice,
  SessionView,
  Stroke,
} from "./protocol.ts"

const RESYNC_MS = 1500
export class HostView {
  readonly instance = crypto.randomUUID()

  state = $state<HostState | null>(null)

  views = $state<Record<string, SessionView>>({})

  loading = new SvelteSet<string>()

  lists = $state<Record<string, Listed[]>>({})

  knowledge = $state<Entry[]>([])

  canvases = $state<CanvasEntry[]>([])

  folders = $state<string[]>([])

  apps = $state<CanvasEntry[]>([])

  datasources = $state<string[]>([])

  knowledgeSources = $state<string[]>([])

  dsChange = $state<{ name: string | null } | null>(null)

  lastChange = $state<Change | null>(null)

  installLog = $state<Record<string, string>>({})

  taps = new Set<(event: HostEvent) => void>()

  private asked = new Set<string>()

  private fresh = new Set<string>()

  private sought = new Set<string>()

  private listing = new Map<string, Promise<void>>()

  constructor(
    readonly id: string,
    readonly call: HostCall,
  ) {
    get<Record<string, Listed[]>>(this.#cacheKey)
      .then(saved => {
        for (const [harness, list] of Object.entries(saved ?? {})) {
          if (!this.fresh.has(harness)) {
            this.lists[harness] = list
          }
        }
      })
      .catch(() => {})
  }

  get #cacheKey() {
    return `lists:${this.id}`
  }

  refresh = async () => {
    this.#adopt(await this.call({ op: "state" }))
  }

  apply = (event: HostEvent) => {
    for (const tap of this.taps) {
      tap(event)
    }

    switch (event.type) {
      case "state":
        this.#adopt(event.state)
        break
      case "view":
        this.views[event.view.id] = event.view
        break
      case "kg":
        this.lastChange = event.change
        this.loadKnowledge().catch(() => {})
        break
      case "install":
        this.installLog[event.harness] = event.line
        break
      case "ds":
        this.dsChange = { name: event.name }
        this.loadDatasources().catch(() => {})
        break
      case "update":
        if (this.views[event.sessionId]) {
          applyUpdate(this.views[event.sessionId].items, event.update)
        }
        break
      case "patch":
        if (this.views[event.sessionId]) {
          Object.assign(this.views[event.sessionId], event.patch)
        }
        break
    }
  }

  #adopt = (state: HostState) => {
    const fresh = this.state === null
    const restarted =
      !!this.state?.boot && !!state.boot && this.state.boot !== state.boot
    const ready = state.knowledge.ready && !this.state?.knowledge.ready

    if (!restarted) {
      const open = new Set(state.open.map(o => o.id))

      for (const gone of this.state?.open.filter(o => !open.has(o.id)) ?? []) {
        delete this.views[gone.id]
      }
    }

    this.state = state

    if (ready) {
      this.loadKnowledge().catch(() => {})
    }

    for (const h of state.harnesses) {
      if (h.enabled && !this.asked.has(h.id)) {
        this.asked.add(h.id)
        this.lists[h.id] ??= []
        this.list(h.id).catch(() => {})
      }

      if (!h.enabled) {
        this.asked.delete(h.id)
        delete this.lists[h.id]
      }
    }

    if (restarted) {
      this.#reopen()
    }

    if (fresh) {
      for (const e of state.external) {
        this.sought.add(e.id)
      }
    } else {
      this.#relist(state)
    }
  }

  #reopen = () => {
    for (const [id, view] of Object.entries(this.views)) {
      delete this.views[id]
      this.load(view.harness, id, view.cwd).catch(() => {})
    }
  }

  #relist = (state: HostState) => {
    const known = new Set([
      ...state.open.map(s => s.id),
      ...Object.values(this.lists).flatMap(l => l.map(s => s.sessionId)),
      ...this.sought,
    ])
    const unseen = state.external.filter(e => !known.has(e.id))

    if (unseen.length === 0) {
      return
    }

    for (const e of unseen) {
      this.sought.add(e.id)
    }

    for (const h of state.harnesses) {
      if (h.enabled && h.kind && !h.profile) {
        this.list(h.id).catch(() => {})
      }
    }
  }

  #target = (sessionId: string) => {
    const open = this.state?.open.find(s => s.id === sessionId)

    if (open) {
      return { harness: open.harness, cwd: open.cwd }
    }

    for (const [harness, list] of Object.entries(this.lists)) {
      const listed = list.find(l => l.sessionId === sessionId)

      if (listed) {
        return { harness, cwd: listed.cwd }
      }
    }

    return null
  }

  list = async (harness: string) => {
    const pending = this.call({ op: "list", harness })
    const settled = pending.then(
      () => {},
      () => {},
    )

    this.listing.set(harness, settled)

    try {
      this.lists[harness] = await pending
      this.fresh.add(harness)
      set(this.#cacheKey, $state.snapshot(this.lists)).catch(() => {})
    } finally {
      if (this.listing.get(harness) === settled) {
        this.listing.delete(harness)
      }
    }
  }

  open = async (sessionId: string, reopen = false) => {
    if (this.views[sessionId]) {
      return
    }

    if (!this.#target(sessionId)) {
      await Promise.all(this.listing.values())
    }

    const target = this.#target(sessionId)

    if (!target) {
      throw new Error(m.error_session_not_found())
    }

    await this.load(target.harness, sessionId, target.cwd, reopen)
  }
  create = async (harness: string, cwd: string) => {
    const view = await this.call({ op: "new", harness, cwd })

    this.views[view.id] = view

    return view.id
  }

  load = async (
    harness: string,
    sessionId: string,
    cwd: string,
    reopen = false,
  ) => {
    if (this.views[sessionId]) {
      return
    }

    const title = this.lists[harness]?.find(
      s => s.sessionId === sessionId,
    )?.title
    this.loading.add(sessionId)

    try {
      const view = await this.call({
        op: "load",
        harness,
        sessionId,
        cwd,
        title,
        reopen,
      })
      this.views[view.id] = view
    } finally {
      this.loading.delete(sessionId)
    }

    setTimeout(() => {
      this.call({ op: "load", harness, sessionId, cwd, title })
        .then(view => {
          const known = this.views[view.id]

          if (known && view.items.length > known.items.length) {
            this.views[view.id] = view
          }
        })
        .catch(() => {})
    }, RESYNC_MS)
  }

  elsewhere = (sessionId: string) =>
    !!this.views[sessionId]?.external &&
    !!this.state?.external.some(e => e.id === sessionId)

  prompt = (sessionId: string, text: string, attachments: Attachment[] = []) =>
    this.call({ op: "prompt", sessionId, text, attachments })

  cancel = (sessionId: string) => this.call({ op: "cancel", sessionId })

  close = async (sessionId: string) => {
    await this.call({ op: "close", sessionId })
    delete this.views[sessionId]
    forgetPrimer(sessionId)
  }

  rename = (sessionId: string, title: string) =>
    this.call({ op: "rename", sessionId, title })

  speechStt = (audio: string, mime: string) =>
    this.call({ op: "speech.stt", audio, mime })

  speechTts = (text: string) => this.call({ op: "speech.tts", text })

  permit = (sessionId: string, optionId: string | null) =>
    this.call({ op: "permit", sessionId, optionId })

  attach = (sessionId: string) => this.call({ op: "attach", sessionId })

  press = (sessionId: string, strokes: Stroke[]) =>
    this.call({ op: "press", sessionId, strokes })

  recall = (sessionId: string) => this.call({ op: "recall", sessionId })

  readAgent = (sessionId: string, agentId: string) =>
    this.call({ op: "agent.read", sessionId, agentId })

  messageAgent = (sessionId: string, description: string, text: string) =>
    this.call({ op: "agent.send", sessionId, description, text })

  answer = (sessionId: string, toolId: string, answers: Picked[]) =>
    this.call({ op: "answer", sessionId, toolId, answers })

  configure = (sessionId: string, configId: string, value: string) =>
    this.call({ op: "option", sessionId, configId, value })

  browse = (path: string) => this.call({ op: "fs.browse", path })

  createSpace = (name: string, folder: string, color?: number) =>
    this.call({ op: "space.create", name, folder, color })

  updateSpace = (
    id: string,
    patch: { name?: string; color?: number; folder?: string },
  ) => this.call({ op: "space.update", id, ...patch })

  deleteSpace = (id: string) => this.call({ op: "space.delete", id })

  moveSpace = (id: string, before: string | null) =>
    this.call({ op: "space.move", id, before })

  place = (sessionId: string, space: string | null, before: string | null) =>
    this.call({ op: "space.place", sessionId, space, before })

  pin = (sessionId: string, pinned: boolean) =>
    this.call({ op: "session.pin", sessionId, pinned })

  seen = (sessionId: string, turn: number) =>
    this.call({ op: "session.seen", sessionId, turn })

  git = (path: string) => this.call({ op: "fs.git", path })

  toggle = (harness: string, enabled: boolean) =>
    this.call({ op: "harness.toggle", harness, enabled })

  setProvider = (harness: string, provider: ProviderChoice | null) =>
    this.call({ op: "harness.provider", harness, provider })

  detect = (force = false) => this.call({ op: "harness.detect", force })

  install = (harness: string, scope: InstallScope) =>
    this.call({ op: "harness.install", harness, scope })

  uninstall = (harness: string) =>
    this.call({ op: "harness.uninstall", harness })

  readHarness = (harness: string) => this.call({ op: "harness.read", harness })

  writeDoc = (harness: string, doc: string, content: string) =>
    this.call({ op: "harness.write", harness, doc, content })

  writeSkill = (harness: string, name: string, content: string) =>
    this.call({ op: "skill.write", harness, name, content })

  removeSkill = (harness: string, name: string) =>
    this.call({ op: "skill.remove", harness, name })

  createProfile = (harness: string, name: string, fork: boolean) =>
    this.call({ op: "profile.create", harness, name, fork })

  removeProfile = (harness: string) =>
    this.call({ op: "profile.remove", harness })

  loadKnowledge = async () => {
    const [docs, canvases, folders, apps] = await Promise.all([
      this.call({ op: "kg.list" }),
      this.call({ op: "kg.canvases" }),
      this.call({ op: "kg.folders" }),
      this.call({ op: "kg.apps" }),
    ])

    this.knowledge = docs
    this.canvases = canvases
    this.folders = folders
    this.apps = apps
  }

  readObject = (key: string) => this.call({ op: "kg.object.read", key })

  writeObject = (key: string, etag: string | null, value: unknown) =>
    this.call({
      op: "kg.object.write",
      key,
      etag,
      value,
      device: settings.deviceName,
      user: settings.userName || undefined,
    })

  createFolder = (path: string) =>
    this.call({
      op: "kg.folder.create",
      path,
      device: settings.deviceName,
      user: settings.userName || undefined,
    })

  removePath = (path: string) =>
    this.call({
      op: "kg.remove",
      path,
      device: settings.deviceName,
      user: settings.userName || undefined,
    })

  movePath = (from: string, to: string) =>
    this.call({
      op: "kg.move",
      from,
      to,
      device: settings.deviceName,
      user: settings.userName || undefined,
    })

  readCanvas = (path: string) => this.call({ op: "kg.canvas.read", path })

  saveCanvas = (path: string, etag: string | null, canvas: Canvas) =>
    this.call({
      op: "kg.canvas.save",
      path,
      etag,
      canvas,
      device: settings.deviceName,
      user: settings.userName || undefined,
    })

  readDoc = (ref: string, versionId?: string) =>
    this.call({ op: "kg.read", ref, versionId })

  createDoc = (path: string, fields: Editable, body: string) =>
    this.call({
      op: "kg.create",
      path,
      fields,
      body,
      device: settings.deviceName,
      user: settings.userName || undefined,
    })

  updateDoc = (ref: string, etag: string, patch: KgPatch) =>
    this.call({
      op: "kg.update",
      ref,
      etag,
      patch,
      device: settings.deviceName,
      user: settings.userName || undefined,
    })

  historyDoc = (ref: string) => this.call({ op: "kg.history", ref })

  revertDoc = (ref: string, versionId: string, etag: string) =>
    this.call({
      op: "kg.revert",
      ref,
      versionId,
      etag,
      device: settings.deviceName,
      user: settings.userName || undefined,
    })

  trashDocs = () => this.call({ op: "kg.trash" })

  restoreDoc = (ref: string, versionId: string) =>
    this.call({
      op: "kg.restore",
      ref,
      versionId,
      device: settings.deviceName,
      user: settings.userName || undefined,
    })

  loadDatasources = async () => {
    const [names, knowledge] = await Promise.all([
      this.call({ op: "ds.list" }),
      this.call({ op: "ds.knowledge.get" }).catch(() => []),
    ])

    this.datasources = names
    this.knowledgeSources = knowledge
  }

  dsList = () => this.call({ op: "ds.list" })

  dsCreate = (name: string) => this.call({ op: "ds.create", name })

  dsDelete = (name: string) => this.call({ op: "ds.delete", name })

  dsTables = (name: string) => this.call({ op: "ds.tables", name })

  dsQuery = (name: string, sql: string, params: unknown[] = []) =>
    this.call({ op: "ds.query", name, sql, params })

  dsExecute = (name: string, sql: string, params: unknown[] = []) =>
    this.call({ op: "ds.execute", name, sql, params })

  dsSetKnowledge = (name: string, on: boolean) =>
    this.call({ op: "ds.knowledge.set", name, on })
}

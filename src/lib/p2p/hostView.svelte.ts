import { applyUpdate } from "#lib/acp/items.ts"
import type { Canvas } from "#lib/knowledge/canvas.ts"
import type { Editable } from "#lib/knowledge/document.ts"
import type { Patch as KgPatch } from "#lib/knowledge/store.ts"
import { m } from "#lib/paraglide/messages.js"
import { settings } from "#lib/store/settings.svelte.ts"
import { markUnread } from "#lib/store/unread.svelte.ts"
import type {
  Attachment,
  Browse,
  CanvasEntry,
  Change,
  Entry,
  HarnessConfig,
  HarnessInfo,
  HostCall,
  HostEvent,
  HostState,
  Listed,
  Loaded,
  LoadedCanvas,
  Saved,
  SavedCanvas,
  SessionView,
  Version,
} from "./protocol.ts"

export class HostView {
  state = $state<HostState | null>(null)

  views = $state<Record<string, SessionView>>({})

  lists = $state<Record<string, Listed[]>>({})

  knowledge = $state<Entry[]>([])

  canvases = $state<CanvasEntry[]>([])

  lastChange = $state<Change | null>(null)

  constructor(
    readonly id: string,
    readonly call: HostCall,
  ) {}

  refresh = async () => {
    this.#adopt((await this.call({ op: "state" })) as HostState)
  }

  #sought = new Set<string>()

  #listing = new Map<string, Promise<void>>()

  #relist = (state: HostState) => {
    const known = new Set([
      ...state.open.map(s => s.id),
      ...Object.values(this.lists).flatMap(l => l.map(s => s.sessionId)),
      ...this.#sought,
    ])
    const unseen = state.external.filter(e => !known.has(e.id))

    if (unseen.length === 0) {
      return
    }

    for (const e of unseen) {
      this.#sought.add(e.id)
    }

    for (const h of state.harnesses) {
      if (h.enabled && h.kind && !h.profile) {
        this.list(h.id).catch(() => {})
      }
    }
  }

  #adopt = (state: HostState) => {
    const fresh = this.state === null
    const before = this.state?.open ?? []

    for (const s of state.open) {
      if (!s.running && before.some(b => b.id === s.id && b.running)) {
        markUnread(`${this.id}:${s.id}`)
      }
    }

    const ready = state.knowledge?.ready && !this.state?.knowledge?.ready

    this.state = state

    if (ready) {
      this.loadKnowledge().catch(() => {})
    }

    for (const h of state.harnesses) {
      if (h.enabled && !(h.id in this.lists)) {
        this.lists[h.id] = []
        this.list(h.id).catch(() => {})
      }

      if (!h.enabled) {
        delete this.lists[h.id]
      }
    }

    if (fresh) {
      for (const e of state.external) {
        this.#sought.add(e.id)
      }
    } else {
      this.#relist(state)
    }
  }

  #target = (sessionId: string) => {
    const open = this.state?.open.find(s => s.id === sessionId)
    const listed = Object.entries(this.lists).flatMap(([harness, list]) =>
      list.filter(l => l.sessionId === sessionId).map(l => ({ harness, ...l })),
    )[0]
    return open
      ? { harness: open.harness, cwd: open.cwd }
      : listed
        ? { harness: listed.harness, cwd: listed.cwd }
        : null
  }

  open = async (sessionId: string) => {
    if (this.views[sessionId]) {
      return
    }

    await Promise.all(this.#listing.values())

    const target = this.#target(sessionId)

    if (!target) {
      throw new Error(m.error_session_not_found())
    }

    await this.load(target.harness, sessionId, target.cwd)
  }

  toggle = (harness: string, enabled: boolean) =>
    this.call({ op: "harness.toggle", harness, enabled })

  detect = () => this.call({ op: "harness.detect" })

  apply = (event: HostEvent) => {
    if (event.type === "state") {
      this.#adopt(event.state)

      return
    }

    if (event.type === "view") {
      this.views[event.view.id] = event.view

      return
    }

    if (event.type === "kg") {
      this.lastChange = event.change
      this.loadKnowledge().catch(() => {})

      return
    }

    const view = this.views[event.sessionId]

    if (!view) {
      return
    }

    if (event.type === "update") {
      applyUpdate(view.items, event.update)
    } else {
      Object.assign(view, event.patch)
    }
  }

  browse = (path: string) =>
    this.call({ op: "fs.browse", path }) as Promise<Browse>

  loadKnowledge = async () => {
    const [docs, canvases] = await Promise.all([
      this.call({ op: "kg.list" }),
      this.call({ op: "kg.canvases" }),
    ])

    this.knowledge = docs as Entry[]
    this.canvases = canvases as CanvasEntry[]
  }

  readCanvas = (path: string) =>
    this.call({ op: "kg.canvas.read", path }) as Promise<LoadedCanvas>

  saveCanvas = (path: string, etag: string | null, canvas: Canvas) =>
    this.call({
      op: "kg.canvas.save",
      path,
      etag,
      canvas,
      device: settings.deviceName,
    }) as Promise<SavedCanvas>

  readDoc = (ref: string, versionId?: string) =>
    this.call({ op: "kg.read", ref, versionId }) as Promise<Loaded>

  createDoc = (path: string, fields: Editable, body: string) =>
    this.call({
      op: "kg.create",
      path,
      fields,
      body,
      device: settings.deviceName,
    }) as Promise<Saved>

  updateDoc = (ref: string, etag: string, patch: KgPatch) =>
    this.call({
      op: "kg.update",
      ref,
      etag,
      patch,
      device: settings.deviceName,
    }) as Promise<Saved>

  historyDoc = (ref: string) =>
    this.call({ op: "kg.history", ref }) as Promise<Version[]>

  revertDoc = (ref: string, versionId: string, etag: string) =>
    this.call({
      op: "kg.revert",
      ref,
      versionId,
      etag,
      device: settings.deviceName,
    }) as Promise<Saved>

  list = async (harness: string) => {
    const pending = this.call({ op: "list", harness }) as Promise<Listed[]>
    const settled = pending.then(
      () => {},
      () => {},
    )

    this.#listing.set(harness, settled)

    try {
      this.lists[harness] = await pending
    } finally {
      if (this.#listing.get(harness) === settled) {
        this.#listing.delete(harness)
      }
    }
  }

  create = async (harness: string, cwd: string) => {
    const view = (await this.call({ op: "new", harness, cwd })) as SessionView

    this.views[view.id] = view

    return view.id
  }

  load = async (harness: string, sessionId: string, cwd: string) => {
    if (this.views[sessionId]) {
      return
    }

    const view = (await this.call({
      op: "load",
      harness,
      sessionId,
      cwd,
    })) as SessionView

    this.views[view.id] = view
  }

  prompt = (sessionId: string, text: string, attachments: Attachment[] = []) =>
    this.call({ op: "prompt", sessionId, text, attachments })

  cancel = (sessionId: string) => this.call({ op: "cancel", sessionId })

  close = async (sessionId: string) => {
    await this.call({ op: "close", sessionId })
    delete this.views[sessionId]
  }

  permit = (sessionId: string, optionId: string | null) =>
    this.call({ op: "permit", sessionId, optionId })

  configure = (sessionId: string, configId: string, value: string) =>
    this.call({ op: "option", sessionId, configId, value })

  readHarness = async (harness: string) =>
    (await this.call({ op: "harness.read", harness })) as HarnessConfig

  writeDoc = (harness: string, doc: string, content: string) =>
    this.call({ op: "harness.write", harness, doc, content })

  writeSkill = (harness: string, name: string, content: string) =>
    this.call({ op: "skill.write", harness, name, content })

  removeSkill = (harness: string, name: string) =>
    this.call({ op: "skill.remove", harness, name })

  createProfile = async (harness: string, name: string, fork: boolean) =>
    (await this.call({
      op: "profile.create",
      harness,
      name,
      fork,
    })) as { harness: HarnessInfo; skipped: string[] }

  removeProfile = (harness: string) =>
    this.call({ op: "profile.remove", harness })
}

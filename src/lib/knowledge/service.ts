import type { Handlers, Op } from "#lib/p2p/protocol.ts"
import type { Actor } from "./document.ts"
import {
  type Change,
  Conflict,
  type Entry,
  KnowledgeStore,
  type Saved,
} from "./store.ts"

type Deps = {
  emit: (change: Change) => void
  notify: (sessionId: string, text: string) => void
  changed: () => void
}

const SETTLE_MS = 3000

const NOTICE_LIMIT = 20

export const human = (device: string, user?: string): Actor => ({
  kind: "human",
  device: device.trim() || "unknown",
  ...(user?.trim() && { user: user.trim() }),
})

export class Knowledge {
  store = new KnowledgeStore()

  status: { ready: boolean; error: string | null } = {
    ready: false,
    error: null,
  }

  #watchers = new Map<string, Set<string>>()

  #pending = new Map<string, ReturnType<typeof setTimeout>>()

  #sent = new Map<string, number>()

  constructor(private readonly deps: Deps) {
    this.store.subscribe(change => {
      deps.emit(change)

      for (const sessionId of this.#watchers.get(change.id) ?? []) {
        if (change.actor.session !== `atrix:${sessionId}`) {
          this.#schedule(sessionId, change.id)
        }
      }
    })
  }

  #schedule = (sessionId: string, id: string) => {
    const key = `${sessionId}:${id}`

    clearTimeout(this.#pending.get(key))
    this.#pending.set(
      key,
      setTimeout(() => {
        this.#pending.delete(key)

        const sent = (this.#sent.get(key) ?? 0) + 1

        this.#sent.set(key, sent)

        if (sent > NOTICE_LIMIT) {
          this.#watchers.get(id)?.delete(sessionId)
        } else {
          this.deps.notify(sessionId, `<atrix-knowledge-change id="${id}" />`)
        }
      }, SETTLE_MS),
    )
  }

  start = async () => {
    try {
      await this.store.start()
      this.status = { ready: true, error: null }
    } catch (e) {
      this.status = {
        ready: false,
        error: e instanceof Error ? e.message : String(e),
      }
    }

    this.deps.changed()
  }

  save = async (write: () => Promise<Entry>): Promise<Saved> => {
    try {
      return { ok: true, entry: await write() }
    } catch (e) {
      if (e instanceof Conflict) {
        return { ok: false, current: e.current }
      }

      throw e
    }
  }

  watch = (sessionId: string, ref: string, on: boolean) => {
    const id = this.store.find(ref)?.meta.id

    if (!id) {
      throw new Error(`not_found: no document ${ref}`)
    }

    const watchers = this.#watchers.get(id) ?? new Set<string>()

    if (on) {
      watchers.add(sessionId)
      this.#sent.delete(`${sessionId}:${id}`)
    } else {
      watchers.delete(sessionId)
    }

    this.#watchers.set(id, watchers)

    return id
  }

  handlers: Handlers<Extract<Op, `kg.${string}`>> = {
    "kg.list": async () => this.store.list(),
    "kg.canvases": async () => this.store.canvasList(),
    "kg.folders": async () => this.store.folderList(),
    "kg.apps": async () => this.store.appList(),
    "kg.object.read": r => this.store.readObject(r.key),
    "kg.object.write": r =>
      this.store.writeObject(r.key, r.etag, r.value, human(r.device, r.user)),
    "kg.folder.create": async r => {
      await this.store.createFolder(r.path, human(r.device, r.user))

      return null
    },
    "kg.remove": async r => {
      await this.store.remove(r.path, human(r.device, r.user))

      return null
    },
    "kg.move": async r => {
      await this.store.move(r.from, r.to, human(r.device, r.user))

      return null
    },
    "kg.canvas.read": r => this.store.readCanvas(r.path),
    "kg.canvas.save": r =>
      this.store.saveCanvas(r.path, r.etag, r.canvas, human(r.device, r.user)),
    "kg.read": r => this.store.read(r.ref, r.versionId),
    "kg.history": r => this.store.history(r.ref),
    "kg.trash": () => this.store.trash(),
    "kg.restore": r =>
      this.save(() =>
        this.store.restore(r.ref, r.versionId, human(r.device, r.user)),
      ),
    "kg.create": r =>
      this.save(() =>
        this.store.create(r.path, r.fields, r.body, human(r.device, r.user)),
      ),
    "kg.update": r =>
      this.save(() =>
        this.store.update(r.ref, r.etag, r.patch, human(r.device, r.user)),
      ),
    "kg.revert": r =>
      this.save(() =>
        this.store.revert(r.ref, r.versionId, r.etag, human(r.device, r.user)),
      ),
  }
}

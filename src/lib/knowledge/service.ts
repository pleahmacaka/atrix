import type { HostRequest, Saved } from "#lib/p2p/protocol.ts"
import type { Actor } from "./document.ts"
import { type Change, Conflict, type Entry, KnowledgeStore } from "./store.ts"

type Request = Extract<HostRequest, { op: `kg.${string}` }>

type Deps = {
  emit: (change: Change) => void
  notify: (sessionId: string, text: string) => void
  changed: () => void
}

const SETTLE_MS = 3000

const NOTICE_LIMIT = 20

export const human = (device: string): Actor => ({
  kind: "human",
  device: device.trim() || "unknown",
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

          return
        }

        this.deps.notify(sessionId, `<atrix-knowledge-change id="${id}" />`)
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

    const watchers = this.#watchers.get(id) ?? new Set()

    if (on) {
      watchers.add(sessionId)
      this.#sent.delete(`${sessionId}:${id}`)
    } else {
      watchers.delete(sessionId)
    }

    this.#watchers.set(id, watchers)

    return id
  }

  handle = (request: Request) => {
    const { store } = this

    switch (request.op) {
      case "kg.list":
        return store.list()
      case "kg.canvases":
        return store.canvasList()
      case "kg.folders":
        return store.folderList()
      case "kg.apps":
        return store.appList()
      case "kg.object.read":
        return store.readObject(request.key)
      case "kg.object.write":
        return store.writeObject(
          request.key,
          request.etag,
          request.value,
          human(request.device),
        )
      case "kg.folder.create":
        return store.createFolder(request.path, human(request.device))
      case "kg.remove":
        return store.remove(request.path, human(request.device))
      case "kg.move":
        return store.move(request.from, request.to, human(request.device))
      case "kg.canvas.read":
        return store.readCanvas(request.path)
      case "kg.canvas.save":
        return store.saveCanvas(
          request.path,
          request.etag,
          request.canvas,
          human(request.device),
        )
      case "kg.read":
        return store.read(request.ref, request.versionId)
      case "kg.history":
        return store.history(request.ref)
      case "kg.create":
        return this.save(() =>
          store.create(
            request.path,
            request.fields,
            request.body,
            human(request.device),
          ),
        )
      case "kg.update":
        return this.save(() =>
          store.update(
            request.ref,
            request.etag,
            request.patch,
            human(request.device),
          ),
        )
      case "kg.revert":
        return this.save(() =>
          store.revert(
            request.ref,
            request.versionId,
            request.etag,
            human(request.device),
          ),
        )
    }
  }
}

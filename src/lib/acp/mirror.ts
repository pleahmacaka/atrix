import type { HarnessKind, SessionView } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import type { ChatItem, Log } from "./items.ts"
import { native } from "./native.ts"
import { SOURCES, type Source } from "./sources.ts"

const POLL_MS = 1500

const TAIL_BYTES = 4_000_000

type Lines = { lines: string[]; offset: number }

type Watch = {
  source: Source
  path: string
  offset: number
  log: Log
  view: SessionView | null
  paused: boolean
  dirty: boolean
}

export class ExternalSessions {
  presence = new Map<string, boolean>()

  #watches = new Map<string, Watch>()

  #timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly home: string,
    private readonly onPresence: () => void,
    private readonly onItems: (view: SessionView) => void,
  ) {}

  start = () => {
    this.#timer ??= setInterval(() => {
      this.#poll().catch(() => {})
    }, POLL_MS)
  }

  get = (id: string) => this.#watches.get(id)?.view ?? undefined

  views = () => [...this.#watches.values()].flatMap(w => w.view ?? [])

  drop = (id: string) => {
    this.#watches.delete(id)
  }

  pause = (id: string) => {
    const watch = this.#watches.get(id)

    if (watch) {
      watch.paused = true
    }
  }

  idle = async (id: string) => {
    while (this.presence.get(id) === true) {
      await new Promise(done => setTimeout(done, POLL_MS))
    }
  }

  adopt = async (id: string, items: ChatItem[]) => {
    const watch = this.#watches.get(id)

    if (!watch?.view) {
      return
    }

    const { offset } = await this.#lines(watch)

    watch.offset = offset
    watch.log.items = items
    watch.view.items = items
    watch.view.running = this.presence.get(id) === true
    watch.paused = false
    this.onItems(watch.view)
  }

  open = async (
    kind: HarnessKind,
    harness: string,
    id: string,
    cwd: string,
    title: string,
  ) => {
    const watch = await this.#watch(SOURCES[kind], id, cwd)

    if (!watch) {
      throw new Error(m.error_session_not_found())
    }

    watch.view ??= {
      id,
      harness,
      cwd,
      title,
      running: this.presence.get(id) ?? false,
      items: watch.log.items,
      ask: null,
      config: [],
      external: true,
      queued: [...watch.log.queue],
    }

    return watch.view
  }

  #watch = async (source: Source, id: string, cwd: string) => {
    const known = this.#watches.get(id)

    if (known) {
      return known
    }

    const path = await source.locate(this.home, id, cwd)

    if (!path) {
      return null
    }

    const watch: Watch = {
      source,
      path,
      offset: 0,
      log: { items: [], queue: [], running: false },
      view: null,
      paused: false,
      dirty: false,
    }

    this.#watches.set(id, watch)
    await this.#read(watch)

    return watch
  }

  #lines = (watch: Watch) =>
    native<Lines>("read_lines", {
      path: watch.path,
      offset: watch.offset,
      tail: TAIL_BYTES,
    })

  #read = async (watch: Watch) => {
    const { lines, offset } = await this.#lines(watch)

    watch.offset = offset

    if (lines.length === 0) {
      return
    }

    for (const line of lines) {
      watch.source.apply(watch.log, line)
    }

    watch.dirty = true

    if (watch.view) {
      watch.view.queued = [...watch.log.queue]
    }
  }

  #live = async () => {
    const live = new Map<string, boolean>()

    for (const source of Object.values(SOURCES)) {
      const found = await source.live().catch(() => new Map())

      for (const [id, busy] of found) {
        if (busy !== null) {
          live.set(id, busy)
          continue
        }

        const watch = await this.#watch(source, id, "").catch(() => null)

        if (watch && !watch.paused) {
          await this.#read(watch).catch(() => {})
        }

        live.set(id, watch?.log.running ?? false)
      }
    }

    return live
  }

  #poll = async () => {
    const next = await this.#live()
    const changed =
      next.size !== this.presence.size ||
      [...next].some(([id, busy]) => this.presence.get(id) !== busy)

    this.presence = next

    for (const [id, watch] of this.#watches) {
      if (!watch.view && !next.has(id)) {
        this.#watches.delete(id)
      }
    }

    for (const [id, watch] of this.#watches) {
      if (!watch.view || watch.paused) {
        continue
      }

      await this.#read(watch).catch(() => {})

      const running = next.get(id) ?? false

      if (!running && watch.log.queue.length > 0) {
        watch.log.queue.length = 0
        watch.view.queued = []
        watch.dirty = true
      }

      if (watch.dirty || watch.view.running !== running) {
        watch.dirty = false
        watch.view.running = running
        this.onItems(watch.view)
      }
    }

    if (changed) {
      this.onPresence()
    }
  }
}

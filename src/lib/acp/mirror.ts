import type { HarnessKind, Listed, SessionView } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import type { ChatItem, Log } from "./items.ts"
import { native } from "./native.ts"
import { type Presence, SOURCES, type Source } from "./sources.ts"

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
  turn: Promise<void>
}

export class ExternalSessions {
  presence = new Map<string, boolean>()

  listings = new Map<HarnessKind, Listed[]>()

  #shelling = new Set<string>()

  #watches = new Map<string, Watch>()

  #timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly home: string,
    private readonly onPresence: () => void,
    private readonly onItems: (view: SessionView) => void,
  ) {}

  ready: Promise<void> = Promise.resolve()

  start = () => {
    if (this.#timer) {
      return
    }

    this.ready = this.#poll().catch(() => {})
    this.#timer = setInterval(() => {
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

    await this.#serial(watch, async () => {
      watch.offset = (await this.#lines(watch)).offset
    })

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
      shells: [],
    }

    return watch.view
  }

  #watch = async (source: Source, id: string, cwd: string) => {
    const known = this.#watches.get(id)

    if (known) {
      await known.turn

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
      log: { items: [], queue: [], sent: [], running: false, shells: [] },
      view: null,
      paused: false,
      dirty: false,
      turn: Promise.resolve(),
    }

    this.#watches.set(id, watch)

    await this.#serial(watch, async () => {
      if (source.head) {
        const lines = await native<string[]>("grep_head", {
          path,
          tail: TAIL_BYTES,
          needles: source.head.needles,
        })

        for (const line of lines) {
          source.head.apply(watch.log, line)
        }
      }

      await this.#pull(watch)
    })

    return watch
  }

  #serial = <T>(watch: Watch, work: () => Promise<T>) => {
    const next = watch.turn.then(work)

    watch.turn = next.then(
      () => {},
      () => {},
    )

    return next
  }

  #lines = (watch: Watch) =>
    native<Lines>("read_lines", {
      path: watch.path,
      offset: watch.offset,
      tail: TAIL_BYTES,
    })

  #read = (watch: Watch) => this.#serial(watch, () => this.#pull(watch))

  #pull = async (watch: Watch) => {
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
    const shelling = new Set<string>()
    const listings = new Map<HarnessKind, Listed[]>()

    for (const [kind, source] of Object.entries(SOURCES) as [
      HarnessKind,
      Source,
    ][]) {
      const found: Map<string, Presence> = await source
        .live()
        .catch(() => new Map())

      listings.set(
        kind,
        [...found.values()].flatMap(p => p.listing ?? []),
      )

      for (const [id, { busy, shell }] of found) {
        if (shell) {
          shelling.add(id)
        }

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

    this.#shelling = shelling
    this.listings = listings

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

      const alive = running || this.#shelling.has(id)

      if (!alive && watch.log.shells.length > 0) {
        watch.log.shells.length = 0
      }

      if (
        JSON.stringify(watch.view.shells ?? []) !==
        JSON.stringify(watch.log.shells)
      ) {
        watch.view.shells = watch.log.shells.map(s => ({ ...s }))
        watch.dirty = true
      }

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

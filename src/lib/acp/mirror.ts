import { z } from "zod"
import { native } from "#lib/native.ts"
import type {
  HarnessKind,
  Listed,
  SessionView,
  Subagent,
} from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import type { ChatItem, Log } from "./items.ts"
import { type Presence, SOURCES, type Source } from "./sources.ts"
import { stepOf, turnTokens } from "./transcript.ts"

type RawAgent = {
  id: string
  meta: { description?: string; finished?: boolean }
  tail: string[]
}

const POLL_MS = 500

const TAIL_BYTES = 4_000_000

type Lines = { lines: string[]; offset: number }

const entrypointLine = z.object({ entrypoint: z.string() })

const entrypointOf = (line: string) => {
  try {
    return entrypointLine.safeParse(JSON.parse(line)).data?.entrypoint
  } catch {
    return undefined
  }
}

type Watch = {
  source: Source
  path: string
  offset: number
  log: Log
  view: SessionView | null
  owner?: string
  owned: boolean
  paused: boolean
  dirty: boolean
  turn: Promise<void>
}

export class ExternalSessions {
  presence = new Map<string, boolean>()

  listings = new Map<HarnessKind, Listed[]>()

  #shelling = new Set<string>()

  #owners = new Map<string, string>()

  #pids = new Map<string, number>()

  #waiting = new Set<string>()

  #watches = new Map<string, Watch>()

  #timer: ReturnType<typeof setInterval> | null = null

  #home = ""

  ready: Promise<void> = Promise.resolve()

  constructor(
    private readonly onPresence: () => void,
    private readonly onItems: (view: SessionView) => void,
  ) {}

  start = (home: string) => {
    if (this.#timer) {
      return
    }

    this.#home = home
    this.ready = this.#poll().catch(() => {})
    this.#timer = setInterval(() => {
      this.#poll().catch(() => {})
    }, POLL_MS)
  }

  live = (id: string) => this.presence.has(id)

  busy = (id: string) => this.presence.get(id) === true

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
    while (this.busy(id)) {
      await new Promise(done => setTimeout(done, POLL_MS))
    }
  }

  type = async (id: string, text: string) => {
    const pid = this.#pids.get(id)

    if (pid === undefined) {
      throw new Error(m.chat_terminal_live())
    }

    if (this.#waiting.has(id)) {
      throw new Error(m.chat_terminal_waiting())
    }

    await native("terminal_type", { pid, text })

    const watch = this.#watches.get(id)

    if (watch?.view) {
      watch.log.queue.push(text)
      watch.view.queued = [...watch.log.queue]
      this.onItems(watch.view)
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
    watch.view.running = this.busy(id)
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
      model: watch.log.model,
    }

    watch.view.commands = (await SOURCES[kind].commands?.(this.#home)) ?? []

    return watch.view
  }

  #watch = async (source: Source, id: string, cwd: string) => {
    const known = this.#watches.get(id)

    if (known) {
      await known.turn

      return known
    }

    const path = await source.locate(this.#home, id, cwd)

    if (!path) {
      return null
    }

    const watch: Watch = {
      source,
      path,
      offset: 0,
      log: { items: [], queue: [], sent: [], running: false, shells: [] },
      view: null,
      owner: this.#owners.get(id),
      owned: false,
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

        this.#feed(watch, lines, source.head.apply)

        watch.owned = false
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

  #feed = (
    watch: Watch,
    lines: string[],
    apply: (log: Log, line: string) => void,
  ) => {
    for (const line of lines) {
      if (!this.#foreign(watch, line)) {
        apply(watch.log, line)
      }
    }
  }

  #foreign = (watch: Watch, line: string) => {
    if (!watch.owner || !line.includes('"entrypoint":"')) {
      return false
    }

    const entrypoint = entrypointOf(line)

    if (entrypoint === undefined) {
      return false
    }

    if (entrypoint === watch.owner) {
      watch.owned = true

      return false
    }

    return watch.owned
  }

  #agents = async (transcript: string): Promise<Subagent[]> =>
    (await native<RawAgent[]>("claude_subagents", { transcript }))
      .filter(a => a.meta.finished !== true)
      .map(a => ({
        id: a.id,
        description: a.meta.description ?? "",
        step: stepOf(a.tail),
      }))

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

    this.#feed(watch, lines, watch.source.apply)

    watch.dirty = true

    if (watch.view) {
      watch.view.queued = [...watch.log.queue]
      watch.view.model = watch.log.model
      watch.view.since = watch.log.since
      watch.view.tokens = turnTokens(watch.log)
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

      for (const [id, { busy, shell, owner, pid, waiting }] of found) {
        if (waiting) {
          this.#waiting.add(id)
        } else {
          this.#waiting.delete(id)
        }

        if (owner) {
          this.#owners.set(id, owner)
        }

        if (pid !== undefined) {
          this.#pids.set(id, pid)
        }

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
      if (watch.view && !watch.paused) {
        await this.#read(watch).catch(() => {})
        await this.#refresh(watch, watch.view, next.get(id) ?? false, id)
      }
    }

    if (changed) {
      this.onPresence()
    }
  }

  #refresh = async (
    watch: Watch,
    view: SessionView,
    running: boolean,
    id: string,
  ) => {
    const { log } = watch

    if (!running && !this.#shelling.has(id) && log.shells.length > 0) {
      log.shells.length = 0
    }

    if (JSON.stringify(view.shells ?? []) !== JSON.stringify(log.shells)) {
      view.shells = log.shells.map(s => ({ ...s }))
      watch.dirty = true
    }

    if (!running && log.queue.length > 0) {
      log.queue.length = 0
      view.queued = []
      watch.dirty = true
    }

    const agents =
      running && watch.source.shared
        ? await this.#agents(watch.path).catch(() => [])
        : []

    if (JSON.stringify(agents) !== JSON.stringify(view.agents ?? [])) {
      view.agents = agents
      watch.dirty = true
    }

    if (running && log.since === undefined) {
      log.since = Date.now()
      view.since = log.since
      watch.dirty = true
    }

    if (watch.dirty || view.running !== running) {
      watch.dirty = false
      view.running = running
      this.onItems(view)
    }
  }
}

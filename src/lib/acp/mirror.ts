import { invoke } from "@tauri-apps/api/core"
import { z } from "zod"
import { messageOf, native } from "#lib/native.ts"
import type {
  Attachment,
  HarnessKind,
  Listed,
  SessionView,
  Stroke,
  Subagent,
  TerminalDialog,
} from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import type { Asked, ChatItem, Log, Picked } from "./items.ts"
import { type Presence, SOURCES, type Source } from "./sources.ts"
import { stepOf, turnPace, turnTokens, usagePace } from "./transcript.ts"

type RawAgent = {
  id: string
  meta: { description?: string; finished?: boolean }
  tail: string[]
  usage?: unknown[]
}

const POLL_MS = 500

// presence lags the CLI, so a prompt typed just now can look like it landed on an idle session
const TYPED_GRACE_MS = 5000

const IMAGE_MARKER = /\[Image #(\d+)\]/g

const CONFIRM_STEP_MS = 300

const CONFIRM_TRIES = 6

// claude rewrites its status file a beat after a keypress; until then the old dialog still reads as waiting
const ANSWERED_MS = 1500

const SCREEN_MS = 2000

const STALE_MS = 5000

const CLOSING = new Set(["digit", "enter", "escape"])

const askedDialog = (view: SessionView): TerminalDialog | null => {
  const questions = view.asked?.questions ?? []
  const question = questions[0]

  return question
    ? {
        lines: questions.map(q => q.question),
        options: question.options.map((o, i) => ({
          digit: i + 1,
          label: o.label,
          detail: o.description,
          current: i === 0,
        })),
      }
    : null
}

const strokesOf = ({ questions }: Asked, answers: Picked[]): Stroke[] => {
  const strokes = questions.flatMap((q, i): Stroke[] => {
    const { picks, text } = answers[i] ?? { picks: [] }
    const valid = picks.every(p => p < q.options.length)

    if (!q.multiSelect && text?.trim()) {
      return [
        { kind: "digit", digit: q.options.length + 1 },
        { kind: "text", text: text.trim() },
        { kind: "enter" },
      ]
    }

    if (!valid || (!q.multiSelect && picks.length !== 1)) {
      throw new Error(m.chat_question_incomplete())
    }

    return q.multiSelect
      ? [
          ...picks.map(p => ({ kind: "digit" as const, digit: p + 1 })),
          { kind: "tab" },
        ]
      : [{ kind: "digit", digit: picks[0] + 1 }]
  })
  const instant = questions.length === 1 && !questions[0].multiSelect

  return instant ? strokes : [...strokes, { kind: "digit", digit: 1 }]
}

const pasteImage = (pid: number, data: string) =>
  invoke("terminal_paste_image", Uint8Array.fromBase64(data), {
    headers: { pid: String(pid) },
  }).catch((e: unknown) => {
    throw new Error(messageOf(e))
  })

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
  seen: Set<string>
  typed?: number
  pasted: Pasted[]
}

type Pasted = { text: string; images: string[]; at: number }

export class ExternalSessions {
  presence = new Map<string, boolean>()

  listings = new Map<HarnessKind, Listed[]>()

  #shelling = new Set<string>()

  #owners = new Map<string, string>()

  #pids = new Map<string, number>()

  #waiting = new Map<string, string>()

  #waited = ""

  #answered = new Map<string, number>()

  #found = new Map<HarnessKind, { at: number; found: Map<string, Presence> }>()

  #screens = new Map<
    string,
    { at: number; kind: string; dialog: TerminalDialog | null }
  >()

  #watches = new Map<string, Watch>()

  #timer: ReturnType<typeof setInterval> | null = null

  #polling = false

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
    this.ready = this.#guarded()
    this.#timer = setInterval(this.#guarded, POLL_MS)
  }

  #guarded = async () => {
    if (this.#polling) {
      return
    }

    this.#polling = true

    await this.#poll().catch(() => {})
    this.#polling = false
  }

  live = (id: string) => this.presence.has(id)

  busy = (id: string) => this.presence.get(id) === true

  waiting = (id: string) => this.#waiting.has(id)

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

  #pid = (id: string) => {
    const pid = this.#pids.get(id)

    if (pid === undefined) {
      throw new Error(m.chat_terminal_live())
    }

    return pid
  }

  interrupt = (id: string) =>
    native("terminal_interrupt", { pid: this.#pid(id) })

  press = async (id: string, strokes: Stroke[]) => {
    const pid = this.#pid(id)
    const view = this.#watches.get(id)?.view

    if (!this.#waiting.has(id) && !view?.dialog) {
      throw new Error(m.chat_terminal_no_dialog())
    }

    const closes = strokes.some(s => CLOSING.has(s.kind))

    this.#screens.delete(id)

    if (closes) {
      this.#answered.set(id, Date.now())

      if (view) {
        view.dialog = null
        this.onItems(view)
      }
    }

    await native("terminal_keys", { pid, strokes })
  }

  #dialog = async (
    id: string,
    view: SessionView,
  ): Promise<TerminalDialog | null> => {
    const pid = this.#pids.get(id)
    const kind = this.#waiting.get(id)
    const read = this.#watches.get(id)?.source.dialog
    const answered = this.#answered.get(id) ?? 0
    const choices = view.asked?.questions.every(q => q.kind === "choice")

    if (pid === undefined || choices || Date.now() - answered < ANSWERED_MS) {
      this.#screens.delete(id)

      return null
    }

    if (!kind || !read) {
      return askedDialog(view)
    }

    const last = this.#screens.get(id)

    if (last && last.kind === kind && Date.now() - last.at < SCREEN_MS) {
      return last.dialog
    }

    const screen = await native<string[]>("terminal_screen", { pid }).catch(
      () => [],
    )
    const dialog = read(screen) ?? askedDialog(view)

    this.#screens.set(id, { at: Date.now(), kind, dialog })

    return dialog
  }

  answer = async (id: string, toolId: string, answers: Picked[]) => {
    const watch = this.#watches.get(id)
    const asked = watch?.log.asked
    const pid = this.#pids.get(id)

    if (
      !watch ||
      asked?.id !== toolId ||
      pid === undefined ||
      !this.#waiting.has(id)
    ) {
      throw new Error(m.chat_question_closed())
    }

    const strokes = strokesOf(asked, answers)

    watch.log.asked = null

    if (watch.view) {
      watch.view.asked = null
      this.onItems(watch.view)
    }

    await native("terminal_keys", { pid, strokes })
  }

  keys = (id: string, text: string) => {
    const pid = this.#pid(id)

    if (this.#waiting.has(id)) {
      throw new Error(m.chat_terminal_waiting())
    }

    return native("terminal_type", { pid, text })
  }

  #showQueue = (id: string, change: (queue: string[]) => void) => {
    const watch = this.#watches.get(id)

    if (watch?.view) {
      change(watch.log.queue)
      watch.view.queued = [...watch.log.queue]
      this.onItems(watch.view)
    }
  }

  type = async (id: string, text: string, attachments: Attachment[]) => {
    const pid = this.#pid(id)

    if (this.#waiting.has(id)) {
      throw new Error(m.chat_terminal_waiting())
    }

    const pasted = attachments.flatMap(a => (a.kind === "text" ? a.text : []))

    const watch = this.#watches.get(id)

    const images = attachments.flatMap(a =>
      a.kind === "image" ? `data:${a.mimeType};base64,${a.data}` : [],
    )

    const entry = { text, images, at: Number.MAX_SAFE_INTEGER }

    if (watch) {
      watch.typed = Date.now()

      if (images.length > 0) {
        watch.pasted.push(entry)
      }
    }

    if (pasted.length === 0) {
      this.#showQueue(id, queue => queue.push(text))
    }

    try {
      for (const a of attachments) {
        if (a.kind === "image") {
          await pasteImage(pid, a.data)
        }
      }

      await native("terminal_type", {
        pid,
        text: [text, ...pasted].filter(Boolean).join("\n\n"),
      })

      const confirm = watch?.source.confirm

      for (let i = 0; confirm?.command(text) && i < CONFIRM_TRIES; i++) {
        await new Promise(r => setTimeout(r, CONFIRM_STEP_MS))

        const screen = await native<string[]>("terminal_screen", { pid }).catch(
          () => [],
        )

        if (confirm.showing(screen)) {
          await native("terminal_keys", { pid, strokes: [{ kind: "enter" }] })

          break
        }
      }

      entry.at = Date.now()
    } catch (e) {
      entry.at = 0

      this.#showQueue(id, queue => {
        const at = queue.lastIndexOf(text)

        if (at !== -1) {
          queue.splice(at, 1)
        }
      })

      throw e
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
      asked: watch.log.asked ?? null,
      shells: [],
      model: watch.log.model,
      context: watch.log.context,
      contextFrom: watch.log.contextFrom,
      contextChars: watch.log.contextChars,
      contextBase: watch.log.contextBase,
      limits: watch.log.limits,
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
      seen: new Set(),
      pasted: [],
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
        ...usagePace(a.usage ?? []),
      }))

  #lines = (watch: Watch) =>
    native<Lines>("read_lines", {
      path: watch.path,
      offset: watch.offset,
      tail: TAIL_BYTES,
    })

  #read = (watch: Watch) => this.#serial(watch, () => this.#pull(watch))

  #capture = (watch: Watch, view: SessionView) => {
    const fresh = view.queued?.filter(text => !watch.seen.has(text)) ?? []
    const recent = Date.now() - TYPED_GRACE_MS

    watch.pasted = watch.pasted.filter(p => p.at > recent)

    for (const text of fresh) {
      watch.seen.add(text)

      const numbers = [...text.matchAll(IMAGE_MARKER)].map(match => match[1])
      const own = watch.pasted.findIndex(p => text.includes(p.text))

      if (numbers.length === 0) {
        continue
      }

      if (own === -1) {
        this.#clipboardPreview(view, numbers.at(-1) ?? "")
        continue
      }

      const [{ images }] = watch.pasted.splice(own, 1)
      const shown = numbers.flatMap((n, i) =>
        images[i] ? [[n, images[i]] as const] : [],
      )

      view.queuedImages = { ...view.queuedImages, ...Object.fromEntries(shown) }
      this.onItems(view)
    }
  }

  #clipboardPreview = (view: SessionView, number: string) => {
    native<ArrayBuffer>("clipboard_image")
      .then(bytes => {
        if (bytes.byteLength === 0) {
          return
        }

        const data = new Uint8Array(bytes).toBase64()

        view.queuedImages = {
          ...view.queuedImages,
          [number]: `data:image/png;base64,${data}`,
        }
        this.onItems(view)
      })
      .catch(() => {})
  }

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
      watch.view.asked = watch.log.asked ?? null
      this.#capture(watch, watch.view)
      watch.view.model = watch.log.model
      watch.view.context = watch.log.context
      watch.view.contextFrom = watch.log.contextFrom
      watch.view.contextChars = watch.log.contextChars
      watch.view.contextBase = watch.log.contextBase
      watch.view.limits = watch.log.limits
      watch.view.since = watch.log.since
      watch.view.tokens = turnTokens(watch.log)
      watch.view.pace = turnPace(watch.log)
    }
  }

  #live = async () => {
    const live = new Map<string, boolean>()
    const present = new Set<string>()
    const shelling = new Set<string>()
    const listings = new Map<HarnessKind, Listed[]>()

    for (const [kind, source] of Object.entries(SOURCES) as [
      HarnessKind,
      Source,
    ][]) {
      const read = await source.live().catch(() => null)
      const last = this.#found.get(kind)
      const found =
        read ??
        (last && Date.now() - last.at < STALE_MS ? last.found : new Map())

      if (read) {
        this.#found.set(kind, { at: Date.now(), found: read })
      }

      listings.set(
        kind,
        [...found.values()].flatMap(p => p.listing ?? []),
      )

      for (const [id, { busy, shell, owner, pid, waiting }] of found) {
        present.add(id)

        if (waiting) {
          this.#waiting.set(id, waiting)
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

    for (const id of [...this.#waiting.keys(), ...this.#pids.keys()]) {
      if (!present.has(id)) {
        this.#waiting.delete(id)
        this.#pids.delete(id)
        this.#answered.delete(id)
        this.#screens.delete(id)
      }
    }

    this.#shelling = shelling
    this.listings = listings

    return live
  }

  #poll = async () => {
    const next = await this.#live()
    const waiting = [...this.#waiting].join("|")
    const changed =
      next.size !== this.presence.size ||
      [...next].some(([id, busy]) => this.presence.get(id) !== busy) ||
      waiting !== this.#waited

    this.#waited = waiting

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

    const settled = Date.now() - (watch.typed ?? 0) > TYPED_GRACE_MS

    if (!running && settled && !this.#waiting.has(id) && log.queue.length > 0) {
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

    const dialog = await this.#dialog(id, view)

    if (JSON.stringify(dialog) !== JSON.stringify(view.dialog ?? null)) {
      view.dialog = dialog
      watch.dirty = true
    }

    if (watch.dirty || view.running !== running) {
      watch.dirty = false
      view.running = running
      this.onItems(view)
    }
  }
}

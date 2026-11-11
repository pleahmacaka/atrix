import { join } from "@tauri-apps/api/path"
import { z } from "zod"
import type { SessionView } from "#lib/p2p/protocol.ts"
import type { ChatItem } from "./items.ts"
import { native } from "./native.ts"
import { applyTranscript } from "./transcript.ts"

const POLL_MS = 1500

const TAIL_BYTES = 4_000_000

const presenceRecords = z.array(
  z
    .object({
      sessionId: z.string(),
      entrypoint: z.string().optional(),
      status: z.string().optional(),
    })
    .loose(),
)

type Lines = { lines: string[]; offset: number }

type Mirror = {
  view: SessionView
  path: string
  offset: number
  paused: boolean
}

const folderOf = (cwd: string) =>
  [...cwd].map(c => (/[a-z0-9]/i.test(c) ? c : "-")).join("")

export class ExternalSessions {
  presence = new Map<string, boolean>()

  #mirrors = new Map<string, Mirror>()

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

  get = (id: string) => this.#mirrors.get(id)?.view

  views = () => [...this.#mirrors.values()].map(m => m.view)

  drop = (id: string) => {
    this.#mirrors.delete(id)
  }

  pause = (id: string) => {
    const mirror = this.#mirrors.get(id)

    if (mirror) {
      mirror.paused = true
    }
  }

  idle = async (id: string) => {
    while (this.presence.get(id) === true) {
      await new Promise(done => setTimeout(done, POLL_MS))
    }
  }

  adopt = async (id: string, items: ChatItem[]) => {
    const mirror = this.#mirrors.get(id)

    if (!mirror) {
      return
    }

    const { offset } = await native<Lines>("read_lines", {
      path: mirror.path,
      offset: mirror.offset,
      tail: TAIL_BYTES,
    })

    mirror.offset = offset
    mirror.view.items = items
    mirror.view.running = this.presence.get(id) === true
    mirror.paused = false
    this.onItems(mirror.view)
  }

  open = async (harness: string, id: string, cwd: string, title: string) => {
    const known = this.#mirrors.get(id)

    if (known) {
      return known.view
    }

    const path = await join(
      this.home,
      ".claude",
      "projects",
      folderOf(cwd),
      `${id}.jsonl`,
    )
    const mirror: Mirror = {
      path,
      offset: 0,
      paused: false,
      view: {
        id,
        harness,
        cwd,
        title,
        running: this.presence.get(id) ?? false,
        items: [],
        ask: null,
        config: [],
        external: true,
      },
    }

    this.#mirrors.set(id, mirror)
    await this.#read(mirror)

    return mirror.view
  }

  #read = async (mirror: Mirror) => {
    const { lines, offset } = await native<Lines>("read_lines", {
      path: mirror.path,
      offset: mirror.offset,
      tail: TAIL_BYTES,
    })

    mirror.offset = offset

    if (lines.length === 0) {
      return false
    }

    const items: ChatItem[] = mirror.view.items

    for (const line of lines) {
      applyTranscript(items, line)
    }

    return true
  }

  #poll = async () => {
    const found = presenceRecords
      .catch([])
      .parse(await native<unknown>("claude_presence"))
      .filter(p => p.entrypoint === "cli")
    const next = new Map(found.map(p => [p.sessionId, p.status === "busy"]))
    const changed =
      next.size !== this.presence.size ||
      [...next].some(([id, busy]) => this.presence.get(id) !== busy)

    this.presence = next

    for (const mirror of this.#mirrors.values()) {
      if (mirror.paused) {
        continue
      }

      const running = next.get(mirror.view.id) ?? false
      const grew = await this.#read(mirror).catch(() => false)

      if (grew || mirror.view.running !== running) {
        mirror.view.running = running
        this.onItems(mirror.view)
      }
    }

    if (changed) {
      this.onPresence()
    }
  }
}

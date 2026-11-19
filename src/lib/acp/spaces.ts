import { join } from "@tauri-apps/api/path"
import { z } from "zod"
import { native } from "#lib/native.ts"
import { SPACE_HUES, type Space, type Turn } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

const SPACE_COLORS = SPACE_HUES.length

const TURN_LIMIT = 500

const LIST_LIMIT = 500

const spaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z
    .number()
    .int()
    .min(0)
    .max(SPACE_COLORS - 1)
    .catch(0),
  folder: z.string().catch(""),
  agents: z.array(z.string()).catch([]),
})

const turnSchema = z.object({
  turn: z.number().int().min(0),
  seen: z.number().int().min(0),
})

const docSchema = z
  .object({
    spaces: z
      .array(z.unknown())
      .catch([])
      .transform(items =>
        items.flatMap(i => spaceSchema.safeParse(i).data ?? []),
      ),
    loose: z
      .array(z.unknown())
      .catch([])
      .transform(ids => ids.filter(id => typeof id === "string")),
    pinned: z
      .array(z.unknown())
      .catch([])
      .transform(ids => ids.filter(id => typeof id === "string")),
    turns: z
      .record(z.string(), z.unknown())
      .catch({})
      .transform(entries =>
        Object.fromEntries(
          Object.entries(entries).flatMap(([id, value]) => {
            const turn = turnSchema.safeParse(value)

            return turn.success ? [[id, turn.data]] : []
          }),
        ),
      ),
  })
  .transform(doc => {
    const claimed = new Set<string>()
    const unique = (ids: string[]) =>
      ids.filter(id => {
        if (claimed.has(id)) {
          return false
        }

        claimed.add(id)

        return true
      })

    return {
      ...doc,
      spaces: doc.spaces
        .filter((s, i, all) => all.findIndex(x => x.id === s.id) === i)
        .map(s => ({ ...s, agents: unique(s.agents) })),
      loose: [...new Set(doc.loose)],
      pinned: [...new Set(doc.pinned)],
    }
  })

type Doc = z.infer<typeof docSchema>

const placed = <T>(items: T[], item: T, before: T | null) => {
  const rest = items.filter(i => i !== item)
  const at = before === null ? -1 : rest.indexOf(before)

  rest.splice(at === -1 ? rest.length : at, 0, item)

  return rest
}

export class Spaces {
  #doc: Doc = { spaces: [], loose: [], pinned: [], turns: {} }

  #path = ""

  #running = new Set<string>()

  load = async (home: string) => {
    const path = await join(home, ".atrix", "spaces.json")
    const raw = await native<string | null>("read_text", { path })

    this.#doc = docSchema.parse(raw ? JSON.parse(raw) : {})
    this.#path = path
  }

  get spaces(): Space[] {
    return structuredClone(this.#doc.spaces)
  }

  get pinned(): string[] {
    return [...this.#doc.pinned]
  }

  pin = async (sessionId: string, pinned: boolean) => {
    if (!sessionId) {
      return
    }

    this.#ready()

    this.#doc.pinned = this.#doc.pinned.filter(id => id !== sessionId)

    if (pinned) {
      this.#doc.pinned = [...this.#doc.pinned, sessionId].slice(-LIST_LIMIT)
    }

    await this.#save()
  }

  get loose(): string[] {
    return [...this.#doc.loose]
  }

  get turns(): Record<string, Turn> {
    return structuredClone(this.#doc.turns)
  }

  #saving: Promise<unknown> = Promise.resolve()

  #save = () => {
    if (!this.#path) {
      return Promise.reject(new Error(m.error_spaces_unreadable()))
    }

    const content = JSON.stringify(this.#doc, null, 2)

    this.#saving = this.#saving
      .catch(() => {})
      .then(() => native("write_text", { path: this.#path, content }))

    return this.#saving
  }

  #ready = () => {
    if (!this.#path) {
      throw new Error(m.error_spaces_unreadable())
    }
  }

  #space = (id: string) => {
    const space = this.#doc.spaces.find(s => s.id === id)

    if (!space) {
      throw new Error(m.error_space_not_found())
    }

    return space
  }

  #leastUsedColor = () => {
    const counts = Array.from(
      { length: SPACE_COLORS },
      (_, color) => this.#doc.spaces.filter(s => s.color === color).length,
    )

    return counts.indexOf(Math.min(...counts))
  }

  create = async (name: string, folder: string, color?: number) => {
    this.#ready()

    const space: Space = {
      id: crypto.randomUUID(),
      name: name.trim(),
      color: color ?? this.#leastUsedColor(),
      folder: folder.trim(),
      agents: [],
    }

    this.#doc.spaces.push(space)
    await this.#save()

    return space
  }

  update = async (
    id: string,
    patch: Partial<Pick<Space, "name" | "color" | "folder">>,
  ) => {
    this.#ready()

    const space = this.#space(id)
    const { name, color, folder } = patch

    if (name?.trim()) {
      space.name = name.trim()
    }

    if (color !== undefined && Number.isInteger(color)) {
      space.color = Math.abs(color) % SPACE_COLORS
    }

    if (folder !== undefined) {
      space.folder = folder.trim()
    }

    await this.#save()
  }

  delete = async (id: string) => {
    this.#ready()

    this.#doc.spaces = this.#doc.spaces.filter(s => s.id !== id)
    await this.#save()
  }

  move = async (id: string, before: string | null) => {
    this.#ready()

    const space = this.#space(id)
    const anchor = this.#doc.spaces.find(s => s.id === before) ?? null

    this.#doc.spaces = placed(this.#doc.spaces, space, anchor)
    await this.#save()
  }

  place = async (
    sessionId: string,
    spaceId: string | null,
    before: string | null,
  ) => {
    if (!sessionId) {
      return
    }

    this.#ready()

    const target = spaceId === null ? null : this.#space(spaceId)

    for (const space of this.#doc.spaces) {
      space.agents = space.agents.filter(a => a !== sessionId)
    }

    this.#doc.loose = this.#doc.loose.filter(a => a !== sessionId)

    if (target) {
      target.agents = placed(target.agents, sessionId, before).slice(
        -LIST_LIMIT,
      )
    } else {
      this.#doc.loose = [...this.#doc.loose, sessionId].slice(-LIST_LIMIT)
    }

    await this.#save()
  }

  seen = async (sessionId: string, turn: number) => {
    this.#ready()

    const entry = this.#doc.turns[sessionId] ?? { turn: 0, seen: 0 }

    entry.seen = Math.max(0, Math.min(turn, entry.turn))
    this.#doc.turns[sessionId] = entry
    await this.#save()
  }

  track = (running: Set<string>, present: Set<string>) => {
    const finished = [...this.#running].filter(
      id => !running.has(id) && present.has(id),
    )

    this.#running = running

    if (finished.length === 0) {
      return
    }

    for (const id of finished) {
      const entry = this.#doc.turns[id] ?? { turn: 0, seen: 0 }

      entry.turn++
      delete this.#doc.turns[id]
      this.#doc.turns[id] = entry
    }

    const ids = Object.keys(this.#doc.turns)

    for (const id of ids.slice(0, Math.max(0, ids.length - TURN_LIMIT))) {
      delete this.#doc.turns[id]
    }

    this.#save().catch(() => {})
  }
}

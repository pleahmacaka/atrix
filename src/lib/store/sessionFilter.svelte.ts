import { z } from "zod"
import type { Recent } from "./recent.ts"
import { persisted } from "./stored.svelte.ts"
import { unread } from "./unread.svelte.ts"

const KEY = "session-filter"

const savedSchema = z.object({
  kind: z.enum(["all", "chat", "session"]).catch("all"),
  status: z.enum(["all", "running", "unread", "open"]).catch("all"),
  harness: z.string().nullable().catch(null),
  sort: z.enum(["activity", "title", "status"]).catch("activity"),
})

type Saved = z.infer<typeof savedSchema>

export type KindFilter = Saved["kind"]

export type StatusFilter = Saved["status"]

export type SortKey = Saved["sort"]

const rank = (r: Recent) => {
  if (r.running) {
    return 0
  }

  if (unread.has(r.key)) {
    return 1
  }

  return r.live ? 2 : 3
}

class SessionFilter {
  value = $state<Saved>(persisted(KEY, savedSchema.parse({}), savedSchema))

  get active() {
    const { kind, status, harness } = this.value

    return kind !== "all" || status !== "all" || harness !== null
  }

  set = (patch: Partial<Saved>) => {
    this.value = { ...this.value, ...patch }
    localStorage.setItem(KEY, JSON.stringify(this.value))
  }

  reset = () => {
    this.set({ kind: "all", status: "all", harness: null })
  }

  apply = (items: Recent[]) => {
    const { kind, status, harness, sort } = this.value
    const kept = items.filter(r => {
      const kindOk =
        kind === "all" || (kind === "chat") === (r.current.kind === "chat")
      const statusOk =
        status === "all" ||
        (status === "running" && r.running) ||
        (status === "unread" && unread.has(r.key)) ||
        (status === "open" && r.live)
      const harnessOk = harness === null || r.harness === harness

      return kindOk && statusOk && harnessOk
    })

    if (sort === "title") {
      return kept.toSorted((a, b) => a.title.localeCompare(b.title))
    }

    if (sort === "status") {
      return kept.toSorted((a, b) => rank(a) - rank(b) || b.at - a.at)
    }

    return kept
  }
}

export const sessionFilter = new SessionFilter()

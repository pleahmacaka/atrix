import type { Recent } from "./recent.ts"
import { unread } from "./unread.svelte.ts"

export type KindFilter = "all" | "chat" | "session"

export type StatusFilter = "all" | "running" | "unread" | "open"

export type SortKey = "activity" | "title" | "status"

const KEY = "session-filter"

type Saved = {
  kind: KindFilter
  status: StatusFilter
  harness: string | null
  sort: SortKey
}

const DEFAULTS: Saved = {
  kind: "all",
  status: "all",
  harness: null,
  sort: "activity",
}

const load = (): Saved => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }
  } catch {
    return DEFAULTS
  }
}

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
  value = $state<Saved>(load())

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

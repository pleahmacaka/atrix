import { z } from "zod"
import { gatewayFetch } from "#lib/store/gateways.svelte.ts"

export const USES = [
  { id: "agent", icon: "lucide:terminal" },
  { id: "webdev", icon: "lucide:app-window" },
  { id: "text", icon: "lucide:message-square-text" },
  { id: "document", icon: "lucide:file-text" },
  { id: "vision", icon: "lucide:image" },
  { id: "search", icon: "lucide:search" },
] as const

export type Use = (typeof USES)[number]["id"]

const ROWS = "https://datasets-server.huggingface.co/rows"

const LIMIT = 100

const PAGES = 3

const WANTED = 20

const arenaRow = z.object({
  row: z.object({
    model_name: z.string(),
    organization: z.string().catch(""),
    rating: z.number().optional(),
    score: z.number().optional(),
    rank: z.number(),
    category: z.string(),
    leaderboard_publish_date: z.string().catch(""),
  }),
})

export type Ranked = {
  name: string
  organization: string
  rating: number
  share: boolean
  rank: number
  published: string
}

const cache = new Map<Use, Promise<Ranked[]>>()

const page = async (use: Use, offset: number) => {
  const params = new URLSearchParams({
    dataset: "lmarena-ai/leaderboard-dataset",
    config: use,
    split: "latest",
    offset: String(offset),
    length: String(LIMIT),
  })
  const response = await gatewayFetch(`${ROWS}?${params}`)

  if (!response.ok) {
    throw new Error(`arena_unavailable: ${response.status}`)
  }

  return z
    .object({ rows: z.array(arenaRow), num_rows_total: z.number().catch(0) })
    .parse(await response.json())
}

const load = async (use: Use) => {
  const rows: z.infer<typeof arenaRow>[] = []

  for (let offset = 0; offset < LIMIT * PAGES; offset += LIMIT) {
    const found = await page(use, offset)

    rows.push(...found.rows)

    const overall = rows.filter(r => r.row.category === "overall").length

    if (overall >= WANTED || offset + LIMIT >= found.num_rows_total) {
      break
    }
  }

  return rows
    .map(r => r.row)
    .filter(r => r.category === "overall")
    .filter(r => r.rating !== undefined || r.score !== undefined)
    .toSorted((a, b) => a.rank - b.rank)
    .map(r => ({
      name: r.model_name,
      organization: r.organization,
      rating: r.rating ?? r.score ?? 0,
      share: r.rating === undefined,
      rank: r.rank,
      published: r.leaderboard_publish_date,
    }))
}

export const rankingOf = (use: Use) => {
  let pending = cache.get(use)

  if (!pending) {
    pending = load(use)
    cache.set(use, pending)
    pending.catch(() => cache.delete(use))
  }

  return pending
}

const tokensOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

const DATE_DIGITS = 4

const SUFFIXES = new Set([
  "latest",
  "preview",
  "exp",
  "experimental",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "thinking",
])

const isDate = (token: string) =>
  token.length >= DATE_DIGITS && [...token].every(c => c >= "0" && c <= "9")

const hasDigit = (token: string) => [...token].some(c => c >= "0" && c <= "9")

export const servedBy = (name: string, ids: string[]) => {
  const want = tokensOf(name)

  return ids.some(id => {
    const have = tokensOf(id.split("/").at(-1) ?? id)
    const [short, long] =
      have.length < want.length ? [have, want] : [want, have]
    const prefix = short.every((t, i) => long[i] === t)
    const next = long[short.length]

    if (short.length === 0 || !prefix) {
      return false
    }

    return (
      next === undefined ||
      (short.some(hasDigit) && (isDate(next) || SUFFIXES.has(next)))
    )
  })
}

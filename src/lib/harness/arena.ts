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
  rating: string
  rank: number
  published: string
}

const cache = new Map<Use, Promise<Ranked[]>>()

const load = async (use: Use) => {
  const params = new URLSearchParams({
    dataset: "lmarena-ai/leaderboard-dataset",
    config: use,
    split: "latest",
    offset: "0",
    length: String(LIMIT),
  })
  const response = await gatewayFetch(`${ROWS}?${params}`)

  if (!response.ok) {
    throw new Error(`arena_unavailable: ${response.status}`)
  }

  const { rows } = z
    .object({ rows: z.array(arenaRow) })
    .parse(await response.json())

  return rows
    .map(r => r.row)
    .filter(r => r.category === "overall")
    .toSorted((a, b) => a.rank - b.rank)
    .map(r => ({
      name: r.model_name,
      organization: r.organization,
      rating:
        r.rating === undefined
          ? `${((r.score ?? 0) * 100).toFixed(1)}%`
          : String(Math.round(r.rating)),
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

const squash = (name: string) =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "")

export const servedBy = (name: string, ids: string[]) => {
  const want = squash(name)

  return ids.some(id => {
    const have = squash(id.split("/").at(-1) ?? id)

    return (
      have.length > 2 &&
      (have === want || want.startsWith(have) || have.startsWith(want))
    )
  })
}

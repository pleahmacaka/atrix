import { z } from "zod"
import { block } from "#lib/chat/blocks.ts"

export const APP_EXTENSION = ".app"

export const HOME_KEY = "apps/home.layout"

export const appFile = z.object({
  title: z.string().trim().min(1).max(80),
  icon: z.string().max(80).default("lucide:app-window"),
  blocks: z.array(block).min(1).max(12),
})

export type AppFile = z.infer<typeof appFile>

const tile = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("app"), key: z.string() }),
  z.object({
    kind: z.literal("folder"),
    id: z.string(),
    name: z.string(),
    apps: z.array(z.string()),
  }),
])

export const home = z.object({ tiles: z.array(tile) })

export type Tile = z.infer<typeof tile>

export type Home = z.infer<typeof home>

const titleIn = (b: z.infer<typeof block>) =>
  "title" in b && typeof b.title === "string" ? b.title : ""

export const appTitleOf = (blocks: z.infer<typeof block>[], fallback: string) =>
  blocks.map(titleIn).find(Boolean) || fallback || "App"

export const appKeyOf = (title: string) => {
  const slug = title
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join("-")
    .slice(0, 40)

  return `apps/${slug || "app"}-${crypto.randomUUID().slice(0, 8)}${APP_EXTENSION}`
}

export const arrange = (stored: Home | null, keys: string[]): Home => {
  const known = new Set(keys)
  const tiles = (stored?.tiles ?? []).flatMap((t): Tile[] => {
    if (t.kind === "app") {
      return known.has(t.key) ? [t] : []
    }

    const apps = t.apps.filter(k => known.has(k))

    return apps.length ? [{ ...t, apps }] : []
  })
  const placed = new Set(
    tiles.flatMap(t => (t.kind === "app" ? [t.key] : t.apps)),
  )

  return {
    tiles: [
      ...tiles,
      ...keys
        .filter(k => !placed.has(k))
        .map((key): Tile => ({ kind: "app", key })),
    ],
  }
}

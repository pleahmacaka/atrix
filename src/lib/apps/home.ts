import { z } from "zod"
import type { Tile } from "./app.ts"

export const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tile"), index: z.number() }),
  z.object({ kind: z.literal("member"), folder: z.string(), key: z.string() }),
])

export type Source = z.infer<typeof sourceSchema>

export type Drop = "before" | "after" | "merge"

const withoutSource = (tiles: Tile[], source: Source) => {
  if (source.kind === "tile") {
    const moved = tiles[source.index]

    return { moved, rest: tiles.filter((_, i) => i !== source.index) }
  }

  const rest = tiles.flatMap((t): Tile[] => {
    if (t.kind !== "folder" || t.id !== source.folder) {
      return [t]
    }

    const apps = t.apps.filter(k => k !== source.key)

    return apps.length ? [{ ...t, apps }] : []
  })

  const moved: Tile = { kind: "app", key: source.key }

  return { moved, rest }
}

const keyOf = (tile: Tile) => (tile.kind === "app" ? tile.key : tile.id)

export const moveTile = (
  tiles: Tile[],
  source: Source,
  target: number,
  drop: Drop,
  folderName: string,
): Tile[] => {
  const anchor = tiles[target]

  if (!anchor) {
    return tiles
  }

  const { moved, rest } = withoutSource(tiles, source)

  if (!moved || keyOf(moved) === keyOf(anchor)) {
    return tiles
  }

  const at = rest.findIndex(t => keyOf(t) === keyOf(anchor))

  if (drop === "merge" && moved.kind === "app") {
    const merged: Tile =
      anchor.kind === "folder"
        ? { ...anchor, apps: [...anchor.apps, moved.key] }
        : {
            kind: "folder",
            id: crypto.randomUUID(),
            name: folderName,
            apps: [anchor.key, moved.key],
          }

    return rest.with(at, merged)
  }

  const index = drop === "after" ? at + 1 : at

  return [...rest.slice(0, index), moved, ...rest.slice(index)]
}

export const releaseMember = (tiles: Tile[], folder: string, key: string) => {
  const { moved, rest } = withoutSource(tiles, { kind: "member", folder, key })

  return [...rest, moved]
}

export const renameFolder = (tiles: Tile[], folder: string, name: string) =>
  tiles.map(t =>
    t.kind === "folder" && t.id === folder
      ? { ...t, name: name.trim() || t.name }
      : t,
  )

export const dissolveFolder = (tiles: Tile[], folder: string) =>
  tiles.flatMap((t): Tile[] =>
    t.kind === "folder" && t.id === folder
      ? t.apps.map(key => ({ kind: "app", key }))
      : [t],
  )

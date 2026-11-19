import { hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { SPACE_HUES, type Space } from "#lib/p2p/protocol.ts"
import { type Recent, recents } from "./recent.ts"

export type Status = "waiting" | "running" | "done" | "idle"

export type AgentRow = {
  item: Recent
  id: string
  status: Status
  turn: number
  pinned: boolean
  since: number | null
  subagents: { id: string; description: string }[]
}

export type SpaceNode = {
  key: string
  space: Space
  auto: boolean
  agents: AgentRow[]
  status: Status
}

export type HostBlock = {
  id: string
  name: string
  local: boolean
  spaces: SpaceNode[]
}

const RANK: Record<Status, number> = {
  waiting: 0,
  running: 1,
  done: 2,
  idle: 3,
}

export const folderKey = (path: string) => {
  const windows = path.includes("\\") || path.at(1) === ":"
  let key = windows ? path.replaceAll("\\", "/").toLowerCase() : path

  while (key.endsWith("/")) {
    key = key.slice(0, -1)
  }

  return key
}

const folderName = (path: string) =>
  path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1)

const hueOf = (key: string) =>
  [...key].reduce((sum, c) => sum + (c.codePointAt(0) ?? 0), 0) %
  SPACE_HUES.length

const folderSpace = (folder: string, fallback: string): Space => ({
  id: "",
  name: folderName(folder) ?? fallback,
  color: hueOf(folderKey(folder)),
  folder,
  agents: [],
})

const nodeOf = (
  key: string,
  space: Space,
  agents: AgentRow[],
  auto: boolean,
): SpaceNode => ({
  key,
  space,
  auto,
  agents,
  status: urgent(agents.map(a => a.status)),
})

export const urgent = (statuses: Status[]): Status =>
  statuses.reduce<Status>((a, b) => (RANK[b] < RANK[a] ? b : a), "idle")

export const spaceTree = (): { hosts: HostBlock[]; chats: Recent[] } => {
  const all = recents()

  const hosts = hostList().map(host => {
    const state = host.view.state
    const spaces = state?.spaces ?? []
    const turns = state?.turns ?? {}
    const open = new Map((state?.open ?? []).map(s => [s.id, s]))
    const external = new Map((state?.external ?? []).map(e => [e.id, e]))
    const pins = new Set(state?.pinned ?? [])
    const pinnedFirst = (rows: AgentRow[]) =>
      rows.toSorted((a, b) => Number(b.pinned) - Number(a.pinned))

    const rowOf = (item: Recent): AgentRow => {
      const id = item.current.id
      const summary = open.get(id)
      const turn = turns[id] ?? { turn: 0, seen: 0 }
      const waiting = !!summary?.waiting || !!external.get(id)?.waiting
      const status: Status = waiting
        ? "waiting"
        : item.running
          ? "running"
          : turn.turn > turn.seen
            ? "done"
            : "idle"

      return {
        item,
        id,
        status,
        turn: turn.turn,
        pinned: pins.has(id),
        since:
          summary?.since ??
          (item.at > 0 && item.at < Number.MAX_SAFE_INTEGER ? item.at : null),
        subagents: summary?.subagents ?? [],
      }
    }

    const placed = new Set(spaces.flatMap(s => s.agents))
    const sessions = all.filter(
      r =>
        r.live &&
        r.current.kind === "session" &&
        r.current.host === host.id &&
        (open.has(r.current.id) || placed.has(r.current.id)),
    )
    const byId = new Map(sessions.map(r => [r.current.id, r]))
    const taken = new Set([
      ...spaces.flatMap(s => s.agents),
      ...(state?.loose ?? []),
    ])

    const nodes: SpaceNode[] = spaces.map(space => {
      const explicit = space.agents.flatMap(id => byId.get(id) ?? [])
      const matched = space.folder
        ? sessions.filter(
            r =>
              !taken.has(r.current.id) &&
              folderKey(r.cwd ?? "") === folderKey(space.folder),
          )
        : []

      for (const r of matched) {
        taken.add(r.current.id)
      }

      const agents = pinnedFirst([...explicit, ...matched].map(rowOf))

      return nodeOf(`${host.id}:${space.id}`, space, agents, false)
    })

    const claimed = new Set(nodes.flatMap(n => n.agents.map(a => a.id)))
    const byFolder = Map.groupBy(
      sessions.filter(r => !claimed.has(r.current.id)),
      r => folderKey(r.cwd ?? ""),
    )

    const folders = [...byFolder].toSorted(([a], [b]) => a.localeCompare(b))

    for (const [key, items] of folders) {
      const agents = pinnedFirst(items.map(rowOf))

      nodes.push(
        nodeOf(
          `${host.id}:folder:${key}`,
          folderSpace(items[0]?.cwd ?? "", host.name),
          agents,
          true,
        ),
      )
    }

    return {
      id: host.id,
      name: host.name,
      local: host.id === LOCAL,
      spaces: nodes,
    }
  })

  const chats = all.filter(r => r.current.kind !== "session")

  return { hosts, chats }
}

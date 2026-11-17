import { z } from "zod"
import { chats } from "#lib/chat/chats.svelte.ts"
import { groups } from "#lib/chat/groups.svelte.ts"
import { brandIcon } from "#lib/components/harness/brands.ts"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { keyOf } from "./keys.ts"
import type { Current } from "./nav.svelte.ts"
import { Stored } from "./stored.svelte.ts"

export type Recent = {
  key: string
  current: NonNullable<Current>
  title: string
  source: string
  icon: string
  running: boolean
  live: boolean
  harness: string | null
  at: number
}

const sessions = (): Recent[] =>
  hostList().flatMap(host => {
    const harnesses = host.view.state?.harnesses ?? []
    const external = new Map(
      (host.view.state?.external ?? []).map(e => [e.id, e.busy]),
    )
    const describe = (harness: string) => {
      const found = harnesses.find(h => h.id === harness)

      return {
        source: m.shell_source({
          host: host.name,
          harness: found?.name ?? harness,
        }),
        icon: brandIcon(found?.base ?? harness),
      }
    }
    const open = (host.view.state?.open ?? []).map(s => ({
      key: `${host.id}:${s.id}`,
      current: { kind: "session" as const, host: host.id, id: s.id },
      harness: s.harness,
      title: s.title || m.common_untitled(),
      running: s.running || external.get(s.id) === true,
      live: true,
      at: Number.MAX_SAFE_INTEGER,
      ...describe(s.harness),
    }))
    const listed = Object.entries(host.view.lists).flatMap(([harness, list]) =>
      list.map(s => ({
        key: `${host.id}:${s.sessionId}`,
        current: { kind: "session" as const, host: host.id, id: s.sessionId },
        harness,
        title: s.title || m.common_untitled(),
        running: external.get(s.sessionId) === true,
        live: external.has(s.sessionId),
        at: s.updatedAt ? Date.parse(s.updatedAt) : 0,
        ...describe(harness),
      })),
    )

    return [...new Map([...listed, ...open].map(r => [r.key, r])).values()]
  })

export const titles = new Stored("title:", "", z.string())

export const recents = (): Recent[] =>
  [
    ...sessions(),
    ...chats.list.map(c => ({
      key: c.id,
      current: { kind: "chat" as const, id: c.id },
      harness: null,
      title: c.title,
      source: c.model,
      icon: "lucide:message-square",
      running: false,
      live: true,
      at: c.at,
    })),
    ...groups.list.map(g => ({
      key: `group:${g.id}`,
      current: { kind: "group" as const, id: g.id },
      harness: null,
      title: g.title,
      source: m.group_source({ count: g.members.length }),
      icon: "lucide:users",
      running: g.members.some(
        p => hostList().find(h => h.id === p.host)?.view.views[p.id]?.running,
      ),
      live: true,
      at: g.at,
    })),
  ]
    .map(r => ({ ...r, title: titles.get(r.key) || r.title }))
    .toSorted((a, b) => b.at - a.at)

export const describe = (current: Current) =>
  current ? recents().find(r => r.key === keyOf(current)) : undefined

import { dateKey, dateTimeKey, pad } from "#lib/calendar/dates.ts"
import type { Entry } from "#lib/knowledge/store.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"

const FOLDER = "memos"

const TITLE_LIMIT = 60

const RECENT = 3

const titleOf = (body: string, now: Date) =>
  body
    .split("\n")[0]
    .replace(/^#+\s*/, "")
    .trim()
    .slice(0, TITLE_LIMIT) || dateTimeKey(now)

const stampOf = (now: Date) =>
  `${dateKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

export const createMemo = (host: HostView, body: string) => {
  const now = new Date()

  return host.createDoc(
    `${FOLDER}/${stampOf(now)}`,
    {
      title: titleOf(body, now),
      description: "",
      tags: [],
      scope: "network",
      links: [],
    },
    body,
  )
}

export const recentMemos = (entries: Entry[]) =>
  entries
    .filter(e => e.key.startsWith(`${FOLDER}/`))
    .toSorted((a, b) => b.meta.updated_at.localeCompare(a.meta.updated_at))
    .slice(0, RECENT)

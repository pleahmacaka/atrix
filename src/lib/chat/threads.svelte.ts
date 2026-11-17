import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { local } from "#lib/store/local.svelte.ts"
import { goPage } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import { drafts } from "./composer.svelte.ts"

const QUOTE_LIMIT = 2000

const quote = (text: string) =>
  text
    .slice(0, QUOTE_LIMIT)
    .split("\n")
    .map(line => `> ${line}`)
    .join("\n")

export const threadsOf = (parent: string, item: string) =>
  local.data.threads.filter(t => t.parent === parent && t.item === item)

const show = (host: string, id: string) => {
  const current = { kind: "session" as const, host, id }

  goPage("chat")

  if (!panes.split(panes.active.id, "right", current)) {
    panes.open(current)
  }
}

export const openThread = (host: string, id: string) => show(host, id)

export const startThread = async (
  host: HostView,
  hostId: string,
  parent: { id: string; harness: string; cwd: string },
  item: { id: string; text: string },
) => {
  const id = await host.create(parent.harness, parent.cwd)

  local.data.threads.push({
    id: crypto.randomUUID(),
    host: hostId,
    parent: parent.id,
    item: item.id,
    session: id,
    at: Date.now(),
  })
  await local.save()
  drafts.set(id, `${quote(item.text)}\n\n`)
  show(hostId, id)
}

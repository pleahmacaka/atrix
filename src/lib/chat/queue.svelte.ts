import { get, set } from "idb-keyval"
import { SvelteMap, SvelteSet } from "svelte/reactivity"
import { z } from "zod"
import { errorText } from "#lib/components/ui/attempt.svelte.ts"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { isBusyError } from "#lib/p2p/protocol.ts"
import { Stored } from "#lib/store/stored.svelte.ts"
import { toAttachment } from "./attachments.ts"

export const queues = new Stored("queue:", [], z.array(z.string()))

const FILES = "queue-files:"

const files = new SvelteMap<string, File[][]>()

const loading = new Set<string>()

const filesOf = (draft: string) => {
  if (!loading.has(draft)) {
    loading.add(draft)
    get<File[][]>(FILES + draft)
      .then(saved => {
        if (saved && !files.has(draft)) {
          files.set(draft, saved)
        }
      })
      .catch(() => {})
  }

  return files.get(draft) ?? []
}

const saveFiles = (draft: string, next: File[][]) => {
  files.set(draft, next)
  set(FILES + draft, next).catch(() => {})
}

export type Queued = { text: string; files: File[] }

export const queuedOf = (draft: string): Queued[] => {
  const attached = filesOf(draft)

  return queues
    .get(draft)
    .map((text, i) => ({ text, files: attached[i] ?? [] }))
}

const write = (draft: string, items: Queued[]) => {
  queues.set(
    draft,
    items.map(i => i.text),
  )
  saveFiles(
    draft,
    items.map(i => i.files),
  )
}

export const enqueue = (draft: string, text: string, attached: File[] = []) =>
  write(draft, [...queuedOf(draft), { text, files: attached }])

export const shiftQueue = (draft: string) => {
  const [next, ...rest] = queuedOf(draft)

  if (next) {
    write(draft, rest)
  }

  return next
}

export const unshiftQueue = (draft: string, item: Queued) =>
  write(draft, [item, ...queuedOf(draft)])

export const takeQueued = (draft: string, index: number) => {
  const items = queuedOf(draft)
  const [taken] = items.splice(index, 1)

  write(draft, items)

  return taken
}

export const editQueued = (draft: string, index: number, text: string) =>
  write(
    draft,
    queuedOf(draft).map((item, i) => (i === index ? { ...item, text } : item)),
  )

export const frontQueued = (draft: string, index: number) => {
  const taken = takeQueued(draft, index)

  if (taken) {
    unshiftQueue(draft, taken)
  }
}

export const clearQueue = (draft: string) => {
  const items = queuedOf(draft)

  write(draft, [])

  return items
}

export const drainFailures = $state<Record<string, string>>({})

const inFlight = new SvelteSet<string>()

export const pending = (draft: string) =>
  inFlight.has(draft) || queues.get(draft).length > 0

const drain = (host: HostView, draft: string, busy: boolean) => {
  if (
    busy ||
    inFlight.has(draft) ||
    drainFailures[draft] !== undefined ||
    queues.get(draft).length === 0
  ) {
    return
  }

  const next = shiftQueue(draft)

  if (!next) {
    return
  }

  inFlight.add(draft)

  Promise.all(next.files.map(toAttachment))
    .then(attachments => host.prompt(draft, next.text, attachments))
    .catch((e: unknown) => {
      unshiftQueue(draft, next)

      if (!isBusyError(e)) {
        drainFailures[draft] = errorText(e)
      }
    })
    .finally(() => inFlight.delete(draft))
}

$effect.root(() => {
  $effect(() => {
    for (const { view } of hostList()) {
      for (const [id, session] of Object.entries(view.views)) {
        drain(view, id, !!session.running && !view.elsewhere(id))
      }
    }
  })
})

import { SvelteSet } from "svelte/reactivity"
import { z } from "zod"
import { errorText } from "#lib/components/ui/attempt.svelte.ts"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { isBusyError } from "#lib/p2p/protocol.ts"
import { Stored } from "#lib/store/stored.svelte.ts"

export const queues = new Stored("queue:", [], z.array(z.string()))

export const enqueue = (draft: string, text: string) =>
  queues.set(draft, [...queues.get(draft), text])

export const drainFailures = $state<Record<string, string>>({})

const inFlight = new SvelteSet<string>()

export const pending = (draft: string) =>
  inFlight.has(draft) || queues.get(draft).length > 0

const drain = (host: HostView, draft: string, busy: boolean) => {
  const [next, ...rest] = queues.get(draft)

  if (
    busy ||
    inFlight.has(draft) ||
    drainFailures[draft] !== undefined ||
    next === undefined
  ) {
    return
  }

  queues.set(draft, rest)
  inFlight.add(draft)

  host
    .prompt(draft, next)
    .catch((e: unknown) => {
      queues.set(draft, [next, ...queues.get(draft)])

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

import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { type CalendarEvent, listEvents } from "./events.ts"

export type SharedEvent = CalendarEvent & { host: HostView }

export const listShared = async (
  hosts: HostView[],
  from: Date,
  to: Date,
): Promise<SharedEvent[]> => {
  const settled = await Promise.allSettled(
    hosts.map(async host =>
      (await listEvents(host, from, to)).map(e => ({ ...e, host })),
    ),
  )
  const failed = settled.find(r => r.status === "rejected")

  if (failed && settled.every(r => r.status === "rejected")) {
    throw failed.reason
  }

  return settled
    .flatMap(r => (r.status === "fulfilled" ? r.value : []))
    .toSorted((a, b) => a.start.localeCompare(b.start))
}

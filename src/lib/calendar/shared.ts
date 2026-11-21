import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { type EventTag, listEvents, listTags } from "./events.ts"
import type { HolidayCheck, Occurrence } from "./recurrence.ts"

export type SharedEvent = Occurrence & { host: HostView }

const settle = async <T>(work: Promise<T[]>[]) => {
  const settled = await Promise.allSettled(work)
  const failed = settled.find(r => r.status === "rejected")

  if (failed && settled.every(r => r.status === "rejected")) {
    throw failed.reason
  }

  return settled.flatMap(r => (r.status === "fulfilled" ? r.value : []))
}

export const listShared = async (
  hosts: HostView[],
  from: Date,
  to: Date,
  isHoliday?: HolidayCheck,
): Promise<SharedEvent[]> =>
  settle(
    hosts.map(async host =>
      (await listEvents(host, from, to, isHoliday)).map(e => ({ ...e, host })),
    ),
  ).then(all =>
    all.toSorted(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start),
    ),
  )

export const sharedTags = async (hosts: HostView[]): Promise<EventTag[]> => {
  const all = await settle(hosts.map(host => listTags(host)))

  return [...new Map(all.map(t => [t.id, t])).values()]
}

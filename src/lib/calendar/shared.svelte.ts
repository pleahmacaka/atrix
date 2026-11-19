import { untrack } from "svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import {
  type EventTag,
  listEvents,
  listTags,
  listTasks,
  type Task,
} from "./store.ts"
import type { HolidayCheck, Occurrence } from "./types.ts"

export type SharedEvent = Occurrence & { host: HostView }

const settle = async <T>(work: Promise<T[]>[]) => {
  const settled = await Promise.allSettled(work)
  const failed = settled.find(r => r.status === "rejected")

  if (failed && settled.every(r => r.status === "rejected")) {
    throw failed.reason
  }

  return settled.flatMap(r => (r.status === "fulfilled" ? r.value : []))
}

const byDay = (a: Occurrence, b: Occurrence) =>
  Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start)

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
  ).then(all => all.toSorted(byDay))

export const sharedTags = async (hosts: HostView[]): Promise<EventTag[]> => {
  const all = await settle(hosts.map(host => listTags(host)))

  return [...new Map(all.map(t => [t.id, t])).values()]
}

export const watchShared = (
  query: () => {
    hosts: HostView[]
    from: Date
    to: Date
    isHoliday: HolidayCheck
  },
  load: (work: () => Promise<void>) => unknown,
  onData: (events: SharedEvent[], tags: EventTag[]) => void,
) => {
  $effect(() => {
    const { hosts, from, to, isHoliday } = query()

    for (const host of hosts) {
      void host.dsChange
    }

    untrack(() =>
      load(async () => {
        const [events, tags] = await Promise.all([
          listShared(hosts, from, to, isHoliday),
          sharedTags(hosts),
        ])

        onData(events, tags)
      }),
    )
  })
}

export type SharedTask = Task & { host: HostView }

const NO_DUE = "9999-12-31"

const byTask = (a: Task, b: Task) =>
  Number(a.done) - Number(b.done) ||
  (a.done
    ? b.updatedAt - a.updatedAt
    : (a.due ?? NO_DUE).localeCompare(b.due ?? NO_DUE) ||
      a.updatedAt - b.updatedAt)

export const listSharedTasks = async (
  hosts: HostView[],
): Promise<SharedTask[]> =>
  settle(
    hosts.map(async host => (await listTasks(host)).map(t => ({ ...t, host }))),
  ).then(all => all.toSorted(byTask))

export const watchTasks = (
  hosts: () => HostView[],
  load: (work: () => Promise<void>) => unknown,
  onData: (tasks: SharedTask[]) => void,
) => {
  $effect(() => {
    const list = hosts()

    for (const host of list) {
      void host.dsChange
    }

    untrack(() => load(async () => onData(await listSharedTasks(list))))
  })
}

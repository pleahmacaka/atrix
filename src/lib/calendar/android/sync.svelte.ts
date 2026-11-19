import { addPluginListener, invoke } from "@tauri-apps/api/core"
import { dateKey, parseLocal } from "#lib/calendar/dates.ts"
import { occurrenceAt } from "#lib/calendar/occurrence.ts"
import {
  applyChange,
  deleteEvent,
  familyOf,
  getEvent,
  putEvent,
} from "#lib/calendar/records.ts"
import { editInSeries, removeFromSeries } from "#lib/calendar/series.ts"
import { allEvents } from "#lib/calendar/store.ts"
import type { CalendarEvent } from "#lib/calendar/types.ts"
import type { Backend } from "#lib/datasource/client.ts"
import { logFailure } from "#lib/logging.ts"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { platform } from "#lib/platform.ts"
import { holidays, prefs } from "../calendar.svelte.ts"
import {
  blankEvent,
  type Clean,
  desiredRows,
  fieldsOf,
  instanceDate,
  type PlanRow,
  preservedRule,
  splitSyncId,
  type Upsert,
} from "./calendarRows.ts"

const call = <T>(command: string, args?: Record<string, unknown>) =>
  invoke<T>(`plugin:calendar-sync|${command}`, args)

const editOne = async (
  backend: Backend,
  seriesId: string,
  seriesDate: string,
  row: PlanRow | null,
) => {
  const series = await getEvent(backend, seriesId)

  if (!series) {
    return
  }

  const family = await familyOf(backend, series.id)
  const stamp = Date.now()

  if (!row) {
    await applyChange(
      backend,
      removeFromSeries(series, seriesDate, "one", family, stamp),
    )

    return
  }

  const occurrence = occurrenceAt(series, seriesDate, holidays.isHoliday)

  if (!occurrence) {
    return
  }

  const draft = fieldsOf(row, { ...occurrence, exdates: [] })
  const oneOff: CalendarEvent = { ...draft, recurrence: "none", until: null }

  await applyChange(
    backend,
    editInSeries(series, occurrence, oneOff, "one", family, stamp),
  )
}

const isException = (row: PlanRow) =>
  row.originalId !== null || !!row.originalSyncId

const pushException = async (
  row: PlanRow,
  hosts: Map<string, HostView>,
  deletes: number[],
) => {
  deletes.push(row.id)

  if (!row.dirty && !row.deleted && !row.canceled && row.syncId) {
    return
  }

  const master = row.originalSyncId ? splitSyncId(row.originalSyncId) : null
  const host = master && hosts.get(master.hostId)

  if (master && host) {
    const gone = row.deleted || row.canceled

    await editOne(host, master.eventId, instanceDate(row), gone ? null : row)
  }
}

const pushMaster = async (
  row: PlanRow,
  hosts: Map<string, HostView>,
  fallback: HostView,
  deletes: number[],
  cleans: Clean[],
) => {
  const parts = row.syncId ? splitSyncId(row.syncId) : null
  const host = parts ? hosts.get(parts.hostId) : fallback

  if (!host || !(row.dirty || row.deleted || !row.syncId)) {
    return
  }

  if (parts?.seriesDate) {
    await editOne(
      host,
      parts.eventId,
      parts.seriesDate,
      row.deleted ? null : row,
    )
    deletes.push(row.id)

    return
  }

  if (row.deleted) {
    if (parts) {
      const stored = await getEvent(host, parts.eventId)

      if (stored) {
        await applyChange(
          host,
          removeFromSeries(
            stored,
            dateKey(parseLocal(stored.start)),
            "all",
            await familyOf(host, stored.id),
            Date.now(),
          ),
        )
      } else {
        await deleteEvent(host, parts.eventId)
      }
    }

    deletes.push(row.id)

    return
  }

  const id = parts?.eventId ?? crypto.randomUUID()
  const stored = (parts && (await getEvent(host, id))) || blankEvent(id)

  await putEvent(host, fieldsOf(row, stored))
  cleans.push({ id: row.id, syncId: `${host.id}/${id}`, signature: null })
}

const push = async (
  rows: PlanRow[],
  hosts: Map<string, HostView>,
  fallback: HostView,
) => {
  const deletes: number[] = []
  const cleans: Clean[] = []

  for (const row of rows.filter(isException)) {
    await pushException(row, hosts, deletes)
  }

  for (const row of rows.filter(row => !isException(row))) {
    await pushMaster(row, hosts, fallback, deletes, cleans)
  }

  if (deletes.length > 0 || cleans.length > 0) {
    await call("apply", { upserts: [], deletes, cleans })
  }
}

const mirror = async (rows: PlanRow[], hosts: HostView[]) => {
  const reached = new Set<string>()
  const desired = new Map<string, Upsert>()

  for (const host of hosts) {
    try {
      for (const upsert of desiredRows(
        host.id,
        await allEvents(host),
        holidays.isHoliday,
      )) {
        desired.set(upsert.syncId, upsert)
      }

      reached.add(host.id)
    } catch (e) {
      logFailure(`calendar sync ${host.id}`, e)
    }
  }

  const local = new Map(
    rows.flatMap(r =>
      r.syncId && !r.originalSyncId && r.originalId === null
        ? [[r.syncId, r] as const]
        : [],
    ),
  )
  const upserts: Upsert[] = []
  const deletes: number[] = []

  for (const [syncId, wanted] of desired) {
    const row = local.get(syncId)
    const upsert = row ? preservedRule(row, wanted) : wanted

    if (!row) {
      upserts.push(upsert)
    } else if (row.signature !== upsert.signature && !row.dirty) {
      upserts.push({ ...upsert, id: row.id })
    }
  }

  for (const [syncId, row] of local) {
    if (
      !desired.has(syncId) &&
      !row.dirty &&
      reached.has(splitSyncId(syncId).hostId)
    ) {
      deletes.push(row.id)
    }
  }

  if (upserts.length > 0 || deletes.length > 0) {
    await call("apply", { upserts, deletes, cleans: [] })
  }
}

const rowsNow = async () => (await call<{ rows: PlanRow[] }>("rows")).rows

let running: Promise<void> | null = null

let again = false

const once = async () => {
  const hosts = hostList().map(h => h.view)

  if (hosts.length === 0) {
    return
  }

  await holidays.load()

  const { granted } = await call<{ granted: boolean }>("ensure")

  if (!granted) {
    throw new Error("calendar_permission_denied")
  }

  await push(await rowsNow(), new Map(hosts.map(h => [h.id, h])), hosts[0])
  await mirror(await rowsNow(), hosts)
}

export const syncNow = () => {
  if (running) {
    again = true

    return running
  }

  running = once()
    .catch(e => logFailure("calendar sync", e))
    .finally(() => {
      running = null

      if (again) {
        again = false
        void syncNow()
      }
    })

  return running
}

export const requestCalendarAccess = async () => {
  const state = await call<{ calendar: string }>("request_permissions", {
    permissions: ["calendar"],
  })

  return state.calendar === "granted"
}

const SYNC_INTERVAL = 60_000

const DEBOUNCE = 1500

export const startAndroidSync = () => {
  if (platform !== "android") {
    return
  }

  let timer: ReturnType<typeof setTimeout> | undefined

  const soon = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (prefs.androidSync) {
        void syncNow()
      }
    }, DEBOUNCE)
  }

  void addPluginListener("calendar-sync", "change", soon).catch(e =>
    logFailure("calendar observer", e),
  )

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      soon()
    }
  })

  setInterval(soon, SYNC_INTERVAL)

  $effect.root(() => {
    $effect(() => {
      for (const host of hostList()) {
        void host.view.dsChange
      }

      if (prefs.androidSync) {
        soon()
      }
    })
  })
}

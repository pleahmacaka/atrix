import { addPluginListener, invoke } from "@tauri-apps/api/core"
import { RRule } from "rrule"
import type { Backend } from "#lib/datasource/client.ts"
import { logFailure } from "#lib/logging.ts"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { platform } from "#lib/platform.ts"
import { holidays, prefs } from "./calendar.svelte.ts"
import {
  allEvents,
  applyChange,
  deleteEvent,
  familyOf,
  getEvent,
  putEvent,
} from "./events.ts"
import {
  addDays,
  type CalendarEvent,
  DAY_MS,
  dateKey,
  dateTimeKey,
  editInSeries,
  occurrenceAt,
  occurrences,
  pad,
  parseLocal,
  type Recurrence,
  removeFromSeries,
  shifted,
} from "./recurrence.ts"

type Row = {
  id: number
  syncId: string | null
  signature: string | null
  dirty: boolean
  deleted: boolean
  title: string
  description: string
  dtstart: number
  dtend: number | null
  duration: string | null
  allDay: boolean
  rrule: string | null
  exdate: string | null
  originalId: number | null
  originalSyncId: string | null
  originalInstanceTime: number | null
  canceled: boolean
}

type Upsert = {
  id?: number
  syncId: string
  signature: string
  title: string
  description: string
  dtstart: number
  dtend: number | null
  duration: string | null
  allDay: boolean
  rrule: string | null
  exdate: string | null
  timezone: string
}

type Clean = { id: number; syncId: string; signature: string | null }

const call = <T>(command: string, args?: Record<string, unknown>) =>
  invoke<T>(`plugin:calendar-sync|${command}`, args)

const INSTANCE_DAYS_BACK = 90

const INSTANCE_DAYS_AHEAD = 400

const utcDay = (key: string) => {
  const [y, mo, d] = key.split("-").map(Number)

  return Date.UTC(y, mo - 1, d)
}

const keyOfUtc = (ms: number) => {
  const d = new Date(ms)

  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

const compactUtc = (ms: number) =>
  `${new Date(ms).toISOString().slice(0, 19).replaceAll("-", "").replaceAll(":", "")}Z`

const parseCompact = (value: string) => {
  const text = value.slice(value.lastIndexOf(":") + 1).trim()
  const y = Number(text.slice(0, 4))
  const mo = Number(text.slice(4, 6)) - 1
  const d = Number(text.slice(6, 8))

  if (text.length <= 8) {
    return {
      key: `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`,
      ms: Date.UTC(y, mo, d),
    }
  }

  const h = Number(text.slice(9, 11))
  const mi = Number(text.slice(11, 13))
  const s = Number(text.slice(13, 15))
  const ms = text.endsWith("Z")
    ? Date.UTC(y, mo, d, h, mi, s)
    : new Date(y, mo, d, h, mi, s).getTime()

  return { key: dateKey(new Date(ms)), ms }
}

const durationMs = (value: string | null) => {
  if (!value) {
    return 0
  }

  const units: Record<string, number> = {
    W: 7 * DAY_MS,
    D: DAY_MS,
    H: 3_600_000,
    M: 60_000,
    S: 1000,
  }
  let total = 0
  let digits = ""

  for (const ch of value.toUpperCase()) {
    if (ch >= "0" && ch <= "9") {
      digits += ch
    } else if (units[ch]) {
      total += Number(digits || 0) * units[ch]
      digits = ""
    }
  }

  return total
}

const RRULE_FREQ: Record<Exclude<Recurrence, "none">, string> = {
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
}

const rruleOf = (event: CalendarEvent) => {
  if (event.recurrence === "none") {
    return null
  }

  const base = RRULE_FREQ[event.recurrence]

  if (!event.until) {
    return base
  }

  const until = event.allDay
    ? event.until.replaceAll("-", "")
    : compactUtc(addDays(parseLocal(event.until), 1).getTime() - 1000)

  return `${base};UNTIL=${until}`
}

const FREQS: Partial<Record<number, Recurrence>> = {
  [RRule.DAILY]: "daily",
  [RRule.WEEKLY]: "weekly",
  [RRule.MONTHLY]: "monthly",
  [RRule.YEARLY]: "yearly",
}

const WORKWEEK = "0,1,2,3,4"

const dayOf = (date: Date, allDay: boolean) =>
  allDay ? keyOfUtc(date.getTime()) : dateKey(date)

const parseRrule = (rule: string, dtstart: number, allDay: boolean) => {
  const options = RRule.parseString(rule)
  const days = [options.byweekday ?? []]
    .flat()
    .map(d => (typeof d === "object" ? d.weekday : d))
  const workweek = days.toSorted().join(",") === WORKWEEK
  const preset = options.freq === undefined ? undefined : FREQS[options.freq]
  const recurrence: Recurrence =
    preset === "weekly" && workweek ? "weekdays" : (preset ?? "none")
  const last = options.count
    ? new RRule({ ...options, dtstart: new Date(dtstart) }).all().at(-1)
    : options.until
  const exact =
    recurrence !== "none" &&
    (options.interval ?? 1) === 1 &&
    !options.bysetpos &&
    !options.bymonthday &&
    !options.byyearday &&
    !options.byweekno &&
    (days.length === 0 || recurrence === "weekdays")

  return {
    recurrence,
    until: last ? dayOf(last, allDay) : null,
    exact,
  }
}

const keepRule = (upsert: Upsert, rrule: string): Upsert => {
  const { signature: _signature, id: _id, ...body } = upsert
  const next = { ...body, rrule }

  return { ...next, signature: JSON.stringify(next) }
}

const preserved = (row: Row, upsert: Upsert) => {
  if (!row.rrule || !upsert.rrule) {
    return upsert
  }

  const kept = parseRrule(row.rrule, row.dtstart, row.allDay)
  const wanted = parseRrule(upsert.rrule, upsert.dtstart, upsert.allDay)

  return !kept.exact && kept.recurrence === wanted.recurrence
    ? keepRule(upsert, row.rrule)
    : upsert
}

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

const bounds = (event: CalendarEvent) => {
  if (event.allDay) {
    const start = utcDay(event.start)

    return { start, end: utcDay(event.end) + DAY_MS }
  }

  return {
    start: parseLocal(event.start).getTime(),
    end: parseLocal(event.end).getTime(),
  }
}

const exdateOf = (event: CalendarEvent) => {
  if (event.exdates.length === 0) {
    return null
  }

  const time = event.allDay ? "" : event.start.slice(10)

  return event.exdates
    .map(day =>
      event.allDay
        ? compactUtc(utcDay(day))
        : compactUtc(parseLocal(`${day}${time}`).getTime()),
    )
    .join(",")
}

const upsertOf = (
  syncId: string,
  event: CalendarEvent,
  recurring: boolean,
): Upsert => {
  const { start, end } = bounds(event)
  const body = {
    syncId,
    title: event.title,
    description: event.notes,
    dtstart: start,
    dtend: recurring ? null : end,
    duration: recurring
      ? event.allDay
        ? `P${Math.round((end - start) / DAY_MS)}D`
        : `P${Math.round((end - start) / 1000)}S`
      : null,
    allDay: event.allDay,
    rrule: recurring ? rruleOf(event) : null,
    exdate: recurring ? exdateOf(event) : null,
    timezone: event.allDay ? "UTC" : zone(),
  }

  return { ...body, signature: JSON.stringify(body) }
}

const desiredOf = (hostId: string, events: CalendarEvent[]) => {
  const today = new Date()
  const from = addDays(today, -INSTANCE_DAYS_BACK)
  const to = addDays(today, INSTANCE_DAYS_AHEAD)

  return events.flatMap(event => {
    const base = `${hostId}/${event.id}`

    if (event.recurrence === "none") {
      return [upsertOf(base, event, false)]
    }

    if (!shifted(event)) {
      return [upsertOf(base, event, true)]
    }

    return occurrences(event, from, to, holidays.isHoliday).map(o =>
      upsertOf(`${base}@${o.seriesDate}`, o, false),
    )
  })
}

const splitSyncId = (syncId: string) => {
  const slash = syncId.lastIndexOf("/")
  const rest = syncId.slice(slash + 1)
  const at = rest.indexOf("@")

  return {
    hostId: syncId.slice(0, slash),
    eventId: at < 0 ? rest : rest.slice(0, at),
    seriesDate: at < 0 ? null : rest.slice(at + 1),
  }
}

const fieldsOf = (row: Row, base: CalendarEvent): CalendarEvent => {
  const length = row.dtend
    ? row.dtend - row.dtstart
    : durationMs(row.duration) || (row.allDay ? DAY_MS : 0)
  const rule = row.rrule ? parseRrule(row.rrule, row.dtstart, row.allDay) : null
  const extra = (row.exdate ?? "")
    .split(",")
    .filter(Boolean)
    .map(v => parseCompact(v).key)

  const timing = row.allDay
    ? {
        start: keyOfUtc(row.dtstart),
        end: keyOfUtc(row.dtstart + Math.max(length, DAY_MS) - DAY_MS),
      }
    : {
        start: dateTimeKey(new Date(row.dtstart)),
        end: dateTimeKey(new Date(row.dtstart + length)),
      }

  return {
    ...base,
    ...timing,
    title: row.title.trim() || base.title,
    notes: row.description,
    allDay: row.allDay,
    recurrence: rule?.recurrence ?? "none",
    until: rule?.until ?? null,
    exdates: rule ? [...new Set([...base.exdates, ...extra])] : [],
    shift: rule ? base.shift : null,
    updatedAt: Date.now(),
  }
}

const blank = (id: string): CalendarEvent => ({
  id,
  title: "",
  notes: "",
  start: "",
  end: "",
  allDay: false,
  color: "",
  recurrence: "none",
  tags: [],
  exdates: [],
  until: null,
  shift: null,
  seriesId: null,
  originalDate: null,
  notesSync: false,
  createdBy: "Android",
  updatedAt: 0,
})

const instanceDate = (row: Row) => {
  const time = row.originalInstanceTime ?? 0

  return row.allDay ? keyOfUtc(time) : dateKey(new Date(time))
}

const editOne = async (
  backend: Backend,
  seriesId: string,
  seriesDate: string,
  row: Row | null,
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

  await applyChange(
    backend,
    editInSeries(
      series,
      occurrence,
      { ...draft, recurrence: "none", until: null },
      "one",
      family,
      stamp,
    ),
  )
}

const push = async (
  rows: Row[],
  hosts: Map<string, HostView>,
  fallback: HostView,
) => {
  const deletes: number[] = []
  const cleans: Clean[] = []
  const exceptions = rows.filter(r => r.originalId !== null || r.originalSyncId)

  for (const row of exceptions) {
    if (!row.dirty && !row.deleted && !row.canceled && row.syncId) {
      continue
    }

    const master = row.originalSyncId ? splitSyncId(row.originalSyncId) : null
    const host = master && hosts.get(master.hostId)

    if (master && host) {
      const gone = row.deleted || row.canceled

      await editOne(host, master.eventId, instanceDate(row), gone ? null : row)
    }

    deletes.push(row.id)
  }

  for (const row of rows) {
    if (row.originalId !== null || row.originalSyncId) {
      continue
    }

    const parts = row.syncId ? splitSyncId(row.syncId) : null
    const host = parts ? hosts.get(parts.hostId) : fallback

    if (!host || !(row.dirty || row.deleted || !row.syncId)) {
      continue
    }

    if (parts?.seriesDate) {
      await editOne(
        host,
        parts.eventId,
        parts.seriesDate,
        row.deleted ? null : row,
      )
      deletes.push(row.id)

      continue
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

      continue
    }

    const id = parts?.eventId ?? crypto.randomUUID()
    const stored = (parts && (await getEvent(host, id))) || blank(id)

    await putEvent(host, fieldsOf(row, stored))
    cleans.push({ id: row.id, syncId: `${host.id}/${id}`, signature: null })
  }

  if (deletes.length > 0 || cleans.length > 0) {
    await call("apply", { upserts: [], deletes, cleans })
  }
}

const mirror = async (rows: Row[], hosts: HostView[]) => {
  const reached = new Set<string>()
  const desired = new Map<string, Upsert>()

  for (const host of hosts) {
    try {
      for (const upsert of desiredOf(host.id, await allEvents(host))) {
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
    const upsert = row ? preserved(row, wanted) : wanted

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

const rowsNow = async () => (await call<{ rows: Row[] }>("rows")).rows

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

export const startCalendarSync = () => {
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

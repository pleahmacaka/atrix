import { RRule } from "rrule"
import {
  addDays,
  DAY_MS,
  dateKey,
  dateTimeKey,
  pad,
  parseLocal,
} from "../dates.ts"
import { occurrences, shifted } from "../occurrence.ts"
import type { CalendarEvent, HolidayCheck, Recurrence } from "../types.ts"

export type PlanRow = {
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

export type Upsert = {
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

export type Clean = { id: number; syncId: string; signature: string | null }

type SyncKey = { hostId: string; eventId: string; seriesDate: string | null }

const INSTANCE_DAYS_BACK = 90

const INSTANCE_DAYS_AHEAD = 400

const HOUR_MS = 3_600_000

const MINUTE_MS = 60_000

const SECOND_MS = 1000

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

const UNIT_MS: Record<string, number> = {
  W: 7 * DAY_MS,
  D: DAY_MS,
  H: HOUR_MS,
  M: MINUTE_MS,
  S: SECOND_MS,
}

const durationMs = (value: string | null) => {
  if (!value) {
    return 0
  }

  let total = 0
  let digits = ""

  for (const ch of value.toUpperCase()) {
    if (ch >= "0" && ch <= "9") {
      digits += ch
    } else if (UNIT_MS[ch]) {
      total += Number(digits || 0) * UNIT_MS[ch]
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
    : compactUtc(addDays(parseLocal(event.until), 1).getTime() - SECOND_MS)

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
  const preset = options.freq === undefined ? undefined : FREQS[options.freq]
  const recurrence: Recurrence =
    preset === "weekly" && days.toSorted().join(",") === WORKWEEK
      ? "weekdays"
      : (preset ?? "none")
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

const keptRule = (upsert: Upsert, rrule: string): Upsert => {
  const { signature: _signature, id: _id, ...body } = upsert
  const next = { ...body, rrule }

  return { ...next, signature: JSON.stringify(next) }
}

const preserved = (row: PlanRow, upsert: Upsert) => {
  if (!row.rrule || !upsert.rrule) {
    return upsert
  }

  const kept = parseRrule(row.rrule, row.dtstart, row.allDay)
  const wanted = parseRrule(upsert.rrule, upsert.dtstart, upsert.allDay)

  return !kept.exact && kept.recurrence === wanted.recurrence
    ? keptRule(upsert, row.rrule)
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
        : `P${Math.round((end - start) / SECOND_MS)}S`
      : null,
    allDay: event.allDay,
    rrule: recurring ? rruleOf(event) : null,
    exdate: recurring ? exdateOf(event) : null,
    timezone: event.allDay ? "UTC" : zone(),
  }

  return { ...body, signature: JSON.stringify(body) }
}

const desiredOf = (
  hostId: string,
  events: CalendarEvent[],
  isHoliday: HolidayCheck,
) => {
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

    return occurrences(event, from, to, isHoliday).map(o =>
      upsertOf(`${base}@${o.seriesDate}`, o, false),
    )
  })
}

const splitSyncId = (syncId: string): SyncKey => {
  const slash = syncId.lastIndexOf("/")
  const rest = syncId.slice(slash + 1)
  const at = rest.indexOf("@")

  return {
    hostId: syncId.slice(0, slash),
    eventId: at < 0 ? rest : rest.slice(0, at),
    seriesDate: at < 0 ? null : rest.slice(at + 1),
  }
}

export const fieldsOf = (row: PlanRow, base: CalendarEvent): CalendarEvent => {
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

export const blankEvent = (id: string): CalendarEvent => ({
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

export const instanceDate = (row: PlanRow) => {
  const time = row.originalInstanceTime ?? 0

  return row.allDay ? keyOfUtc(time) : dateKey(new Date(time))
}

export { desiredOf as desiredRows, preserved as preservedRule, splitSyncId }

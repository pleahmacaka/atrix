import {
  addDays,
  DAY_MS,
  dateKey,
  dateTimeKey,
  dayDelta,
  parseLocal,
} from "#lib/calendar/dates.ts"
import { blankDraft } from "#lib/calendar/draft.ts"
import { openEnded, shiftable } from "#lib/calendar/occurrence.ts"
import { parseTimeToken, withoutToken } from "#lib/calendar/timeparse.ts"
import type { CalendarEvent, Recurrence, Shift } from "#lib/calendar/types.ts"

export type Seed = { day: Date; span: number; parent: string | null }

export type Draft = {
  title: string
  notes: string
  allDay: boolean
  date: string
  start: string
  end: string
  hasEnd: boolean
  days: number
  recurrence: Recurrence
  shift: Shift | "none"
  reminder: number | null
  tags: string[]
  parent: string | null
  task: boolean
}

const DAY_MINUTES = 1_440

const DEFAULT_LENGTH = 60

const DEFAULT_START = "10:00"

const DEFAULT_END = "11:00"

const clockOf = (value: string) => value.slice(11, 16)

const minutesOf = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number)

  return hours * 60 + minutes
}

const clockAt = (minutes: number) => {
  const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const pad = (n: number) => String(n).padStart(2, "0")

  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`
}

const atMinutes = (day: Date, minutes: number) =>
  new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  )

const keptDays = (event: CalendarEvent) => {
  const length =
    parseLocal(event.end).getTime() - parseLocal(event.start).getTime()

  return !event.allDay && length < DAY_MS
    ? 0
    : Math.max(0, dayDelta(event.start, event.end))
}

export const draftFrom = (
  event: CalendarEvent | null,
  seed: Seed,
  reminder: number | null,
): Draft => {
  const timed = event !== null && !event.allDay

  return {
    title: event?.title ?? "",
    notes: event?.notes ?? "",
    allDay: event?.allDay ?? seed.span > 0,
    date: event ? event.start.slice(0, 10) : dateKey(seed.day),
    start: timed ? clockOf(event.start) : DEFAULT_START,
    end: timed ? clockOf(event.end) : DEFAULT_END,
    hasEnd: !event || !openEnded(event),
    days: event ? keptDays(event) : seed.span,
    recurrence: event?.recurrence ?? "none",
    shift: event?.shift ?? "none",
    reminder: event ? event.reminder : reminder,
    tags: event?.tags ?? [],
    parent: event ? event.parentId : seed.parent,
    task: event?.task ?? false,
  }
}

const titled = (draft: Draft): Draft => {
  const token = draft.allDay ? null : parseTimeToken(draft.title)

  if (!token) {
    return draft
  }

  const length =
    (minutesOf(draft.end) - minutesOf(draft.start) + DAY_MINUTES) %
      DAY_MINUTES || DEFAULT_LENGTH

  return {
    ...draft,
    title: withoutToken(draft.title, token),
    start: clockAt(token.minutes),
    end: clockAt(token.minutes + length),
  }
}

export const finalTitle = (draft: Draft) => titled(draft).title.trim()

const timesOf = (draft: Draft) => {
  const day = parseLocal(draft.date)
  const start = atMinutes(day, minutesOf(draft.start))

  if (!draft.hasEnd) {
    return { day, start, end: start }
  }

  const end = atMinutes(addDays(day, draft.days), minutesOf(draft.end))

  return { day, start, end: end < start ? addDays(end, 1) : end }
}

export const isValid = (draft: Draft) => {
  const { day, start, end } = timesOf(draft)

  if (finalTitle(draft) === "" || Number.isNaN(day.getTime())) {
    return false
  }

  return (
    draft.allDay ||
    (!Number.isNaN(start.getTime()) && (!draft.hasEnd || end > start))
  )
}

export const eventFrom = (
  input: Draft,
  stored: CalendarEvent | null,
  stamp: number,
): CalendarEvent => {
  const draft = titled(input)
  const { day, start, end } = timesOf(draft)
  const base = stored ?? blankDraft(day)

  return {
    ...base,
    title: draft.title.trim(),
    notes: draft.notes,
    allDay: draft.allDay,
    start: draft.allDay ? dateKey(day) : dateTimeKey(start),
    end: draft.allDay ? dateKey(addDays(day, draft.days)) : dateTimeKey(end),
    reminder: draft.reminder,
    recurrence: draft.recurrence,
    tags: draft.tags,
    parentId: draft.parent,
    task: draft.task,
    shift:
      shiftable(draft.recurrence) && draft.shift !== "none"
        ? draft.shift
        : null,
    updatedAt: stamp,
  }
}

import {
  addDays,
  DAY_MS,
  dateKey,
  dateTimeKey,
  parseLocal,
  startOfDay,
} from "./dates.ts"
import type {
  CalendarEvent,
  HolidayCheck,
  Occurrence,
  Recurrence,
} from "./types.ts"
import { SHIFT_LIMIT } from "./types.ts"

const SHIFTABLE: Recurrence[] = ["weekly", "monthly", "yearly"]

export const shiftable = (recurrence: Recurrence) =>
  SHIFTABLE.includes(recurrence)

const shiftStep = (event: CalendarEvent) => {
  if (!shiftable(event.recurrence)) {
    return 0
  }

  return event.shift === "next" ? 1 : event.shift === "previous" ? -1 : 0
}

export const inSeries = (event: CalendarEvent) =>
  event.recurrence !== "none" || !!event.seriesId

export const shifted = (event: CalendarEvent) => shiftStep(event) !== 0

export const openEnded = (event: CalendarEvent) =>
  !event.allDay && event.end === event.start

export const occurrenceKey = (event: Occurrence) =>
  event.seriesDate ?? event.start.slice(0, 10)

export const isDone = (event: Occurrence) =>
  event.task && event.done.includes(occurrenceKey(event))

export const withDone = (
  stored: CalendarEvent,
  key: string,
  done: boolean,
  stamp: number,
): CalendarEvent => {
  const rest = stored.done.filter(day => day !== key)

  return { ...stored, done: done ? [...rest, key] : rest, updatedAt: stamp }
}

export const span = (event: CalendarEvent) => {
  const start = parseLocal(event.start)
  const rawEnd = parseLocal(event.end)
  const latest = new Date(Math.max(start.getTime(), rawEnd.getTime()))
  const end = event.allDay ? addDays(startOfDay(latest), 1) : latest

  return { start, end }
}

const inWindow = (start: Date, end: Date, from: Date, to: Date) =>
  start < to && (end > from || start >= from)

const shiftMonths = (origin: Date, months: number) => {
  const next = new Date(
    origin.getFullYear(),
    origin.getMonth() + months,
    1,
    origin.getHours(),
    origin.getMinutes(),
  )
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()

  next.setDate(Math.min(origin.getDate(), lastDay))

  return next
}

const shiftStart = (recurrence: Recurrence, origin: Date, n: number) => {
  switch (recurrence) {
    case "weekly":
      return addDays(origin, 7 * n)
    case "monthly":
      return shiftMonths(origin, n)
    case "yearly":
      return shiftMonths(origin, 12 * n)
    default:
      return addDays(origin, n)
  }
}

const monthsBetween = (origin: Date, target: Date) =>
  (target.getFullYear() - origin.getFullYear()) * 12 +
  target.getMonth() -
  origin.getMonth()

const stepsTo = (recurrence: Recurrence, origin: Date, target: Date) => {
  const gap = target.getTime() - origin.getTime()

  switch (recurrence) {
    case "weekly":
      return gap / (7 * DAY_MS)
    case "daily":
    case "weekdays":
      return gap / DAY_MS
    case "monthly":
      return monthsBetween(origin, target)
    case "yearly":
      return monthsBetween(origin, target) / 12
    default:
      return 0
  }
}

const firstStep = (
  recurrence: Recurrence,
  origin: Date,
  lookback: number,
  from: Date,
) => {
  const target = new Date(from.getTime() - lookback)

  if (target.getTime() <= origin.getTime()) {
    return 0
  }

  return Math.max(0, Math.floor(stepsTo(recurrence, origin, target)) - 1)
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6

const restDay = (d: Date, isHoliday?: HolidayCheck) =>
  isWeekend(d) || (isHoliday?.(d) ?? false)

const moveOff = (d: Date, step: 1 | -1, isHoliday?: HolidayCheck) => {
  let moved = d

  for (let i = 0; i < SHIFT_LIMIT && restDay(moved, isHoliday); i++) {
    moved = addDays(moved, step)
  }

  return moved
}

const occurrenceOf = (
  event: CalendarEvent,
  start: Date,
  end: Date,
): Occurrence => ({
  ...event,
  start: event.allDay ? dateKey(start) : dateTimeKey(start),
  end: event.allDay ? dateKey(addDays(end, -1)) : dateTimeKey(end),
})

const inNeighbor = (
  moved: Date | undefined,
  raw: Date,
  neighbor: Date,
  step: number,
) =>
  moved === undefined ||
  moved === raw ||
  (step > 0 ? moved < neighbor : moved >= addDays(neighbor, 1))

export const occurrences = (
  event: CalendarEvent,
  from: Date,
  to: Date,
  isHoliday?: HolidayCheck,
): Occurrence[] => {
  const origin = span(event)
  const duration = origin.end.getTime() - origin.start.getTime()

  if (Number.isNaN(duration)) {
    return []
  }

  if (event.recurrence === "none") {
    return inWindow(origin.start, origin.end, from, to) ? [event] : []
  }

  const found: Occurrence[] = []
  const days = Math.round(duration / DAY_MS)
  const excluded = new Set(event.exdates)
  const step = shiftStep(event)
  const horizon = step < 0 ? addDays(to, SHIFT_LIMIT) : to
  const lookback = duration + (step > 0 ? SHIFT_LIMIT * DAY_MS : 0)

  for (
    let n = firstStep(event.recurrence, origin.start, lookback, from);
    ;
    n++
  ) {
    const raw = shiftStart(event.recurrence, origin.start, n)
    const key = dateKey(raw)

    if (raw >= horizon || (event.until && key > event.until)) {
      break
    }

    if (
      excluded.has(key) ||
      (event.recurrence === "weekdays" && isWeekend(raw))
    ) {
      continue
    }

    const moved =
      step !== 0 && restDay(raw, isHoliday)
        ? moveOff(raw, step > 0 ? 1 : -1, isHoliday)
        : raw
    const neighbor = startOfDay(
      shiftStart(event.recurrence, origin.start, n + step),
    )

    const shiftedMoved = moved === raw ? undefined : moved

    if (!inNeighbor(shiftedMoved, raw, neighbor, step)) {
      continue
    }

    const end = event.allDay
      ? addDays(moved, days)
      : new Date(moved.getTime() + duration)

    if (!inWindow(moved, end, from, to)) {
      continue
    }

    found.push({
      ...occurrenceOf(event, moved, end),
      seriesDate: key,
      ...(shiftedMoved ? { shiftedFrom: key } : {}),
    })
  }

  return found
}

export const occurrenceAt = (
  event: CalendarEvent,
  seriesDate: string,
  isHoliday?: HolidayCheck,
) => {
  const day = parseLocal(seriesDate)

  return (
    occurrences(
      event,
      addDays(day, -SHIFT_LIMIT),
      addDays(day, SHIFT_LIMIT + 1),
      isHoliday,
    ).find(occurrence => occurrence.seriesDate === seriesDate) ?? null
  )
}

const byStart = (a: CalendarEvent, b: CalendarEvent) =>
  Number(b.allDay) - Number(a.allDay) ||
  new Date(a.start).getTime() - new Date(b.start).getTime()

export const expand = (
  events: CalendarEvent[],
  from: Date,
  to: Date,
  isHoliday?: HolidayCheck,
) => events.flatMap(e => occurrences(e, from, to, isHoliday)).sort(byStart)

export const onDay = (event: CalendarEvent, day: Date) => {
  const { start, end } = span(event)
  const first = startOfDay(day)

  return inWindow(start, end, first, addDays(first, 1))
}

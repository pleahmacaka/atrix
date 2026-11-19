import { addDays, dateKey, dayDelta, startOfDay } from "#lib/calendar/dates.ts"
import { occurrenceAt, occurrences, span } from "#lib/calendar/occurrence.ts"
import type { SharedEvent, SharedRecord } from "#lib/calendar/shared.svelte.ts"
import type { CalendarEvent, HolidayCheck } from "#lib/calendar/types.ts"

export type DayRange = [Date, Date]

export type DragRange = { from: Date; to: Date }

const byStart = (a: SharedEvent, b: SharedEvent) =>
  Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start)

export const occurrencesIn = (
  records: SharedRecord[],
  from: Date,
  to: Date,
  isHoliday: HolidayCheck,
): SharedEvent[] =>
  records
    .flatMap(record =>
      occurrences(record, from, to, isHoliday).map(o => ({
        ...o,
        host: record.host,
      })),
    )
    .sort(byStart)

export const eventsOn = (
  records: SharedRecord[],
  day: Date,
  isHoliday: HolidayCheck,
) => {
  const first = startOfDay(day)

  return occurrencesIn(records, first, addDays(first, 1), isHoliday)
}

export const eventsByDay = (
  records: SharedRecord[],
  from: Date,
  days: number,
  isHoliday: HolidayCheck,
) => {
  const first = startOfDay(from)
  const to = addDays(first, days)
  const found = new Map<string, SharedEvent[]>()

  for (const occurrence of occurrencesIn(records, first, to, isHoliday)) {
    const { start, end } = span(occurrence)

    for (
      let day = start < first ? first : startOfDay(start);
      day < to && (end > day || start >= day);
      day = addDays(day, 1)
    ) {
      const key = dateKey(day)

      found.set(key, [...(found.get(key) ?? []), occurrence])
    }
  }

  return found
}

export const monthGrid = (year: number, month: number, weekStartsOn: 0 | 1) => {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  const start = addDays(first, -offset)

  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  )
}

export const selectedRange = (
  selected: Date,
  end: Date | null,
  drag: DragRange | null,
): DayRange | null => {
  if (drag) {
    return drag.from <= drag.to ? [drag.from, drag.to] : [drag.to, drag.from]
  }

  return end ? [selected, end] : null
}

export const rangeTone = (
  day: Date,
  range: DayRange | null,
  weekStartsOn: number,
) => {
  if (!range || day < range[0] || day > range[1]) {
    return null
  }

  const column = (day.getDay() - weekStartsOn + 7) % 7
  const first = column === 0 || dateKey(day) === dateKey(range[0])
  const last = column === 6 || dateKey(day) === dateKey(range[1])

  return [
    "bg-primary/15",
    !first && "-ms-0.5 rounded-s-none",
    !last && "-me-0.5 rounded-e-none",
  ]
}

const UNORDERED = Number.MAX_SAFE_INTEGER

export const orderedDay = (
  shown: SharedRecord[],
  day: Date,
  isHoliday: HolidayCheck,
) => {
  const list = eventsOn(shown, day, isHoliday)
  const allDay = list
    .filter(e => e.allDay)
    .sort((a, b) => (a.order ?? UNORDERED) - (b.order ?? UNORDERED))

  return [...allDay, ...list.filter(e => !e.allDay)]
}

export const daySections = (
  selected: Date,
  end: Date | null,
  ordered: (day: Date) => SharedEvent[],
) => {
  if (!end) {
    return [{ day: selected, events: ordered(selected) }]
  }

  const seen = new Set<string>()
  const length = dayDelta(dateKey(selected), dateKey(end)) + 1

  return Array.from({ length }, (_, index) => {
    const day = addDays(selected, index)
    const events = ordered(day).filter(e => {
      const fresh = !seen.has(e.id + e.start)

      seen.add(e.id + e.start)

      return fresh
    })

    return { day, events }
  })
}

export const openOccurrence = (
  records: SharedRecord[],
  id: string,
  date: string | null,
  isHoliday: HolidayCheck,
): SharedEvent | null => {
  const found = records.find(e => e.id === id)

  if (!found || found.recurrence === "none" || !date) {
    return found ?? null
  }

  const occurrence = occurrenceAt(found, date, isHoliday)

  return occurrence && { ...occurrence, host: found.host }
}

export const childrenOf = (shown: SharedRecord[], event: CalendarEvent) =>
  shown
    .filter(e => e.parentId === event.id)
    .sort((a, b) => a.start.localeCompare(b.start))

export const reorderRecords = (
  day: SharedEvent[],
  shown: SharedRecord[],
  fromId: string,
  toId: string,
  after: boolean,
) => {
  if (fromId === toId) {
    return []
  }

  const next = day.filter(e => e.allDay)
  const from = next.findIndex(e => e.id === fromId)

  if (from < 0 || !next.some(e => e.id === toId)) {
    return []
  }

  const [moved] = next.splice(from, 1)
  const target = next.findIndex(e => e.id === toId)

  next.splice(after ? target + 1 : target, 0, moved)

  return next.flatMap((occurrence, index) => {
    const base = shown.find(e => e.id === occurrence.id)

    return base && base.order !== index ? [{ ...base, order: index }] : []
  })
}

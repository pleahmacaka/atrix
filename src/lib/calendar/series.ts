import {
  addDays,
  DAY_MS,
  dateKey,
  dateTimeKey,
  dayDelta,
  parseLocal,
} from "./dates.ts"
import type { CalendarEvent, Occurrence, Scope, SeriesChange } from "./types.ts"

const childrenOf = (all: CalendarEvent[], seriesId: string) =>
  all.filter(event => event.seriesId === seriesId)

const firstDate = (series: CalendarEvent) => dateKey(parseLocal(series.start))

const dayBefore = (key: string) => dateKey(addDays(parseLocal(key), -1))

const rekey = (key: string, days: number) =>
  days === 0 ? key : dateKey(addDays(parseLocal(key), days))

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes()

const atMinutes = (day: Date, minutes: number) =>
  new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  )

const placed = (draft: CalendarEvent, day: Date) => {
  const draftStart = parseLocal(draft.start)
  const length = parseLocal(draft.end).getTime() - draftStart.getTime()

  if (draft.allDay) {
    return {
      start: dateKey(day),
      end: dateKey(addDays(day, Math.round(length / DAY_MS))),
    }
  }

  const start = atMinutes(day, minutesOf(draftStart))

  return {
    start: dateTimeKey(start),
    end: dateTimeKey(new Date(start.getTime() + length)),
  }
}

const exclude = (series: CalendarEvent, seriesDate: string, stamp: number) => ({
  ...series,
  exdates: series.exdates.includes(seriesDate)
    ? series.exdates
    : [...series.exdates, seriesDate],
  updatedAt: stamp,
})

const cut = (
  series: CalendarEvent,
  seriesDate: string,
  all: CalendarEvent[],
) => ({
  head: {
    ...series,
    until: dayBefore(seriesDate),
    exdates: series.exdates.filter(day => day < seriesDate),
  },
  later: childrenOf(all, series.id).filter(
    event => (event.originalDate ?? "") >= seriesDate,
  ),
})

const wholeSeries = (
  series: CalendarEvent,
  all: CalendarEvent[],
): SeriesChange => ({
  put: [],
  remove: [series.id, ...childrenOf(all, series.id).map(event => event.id)],
})

export const shareNotes = (
  series: CalendarEvent,
  notes: string,
  all: CalendarEvent[],
  stamp: number,
): SeriesChange => ({
  put: [series, ...childrenOf(all, series.id)].map(event => ({
    ...event,
    notes,
    updatedAt: stamp,
  })),
  remove: [],
})

export const removeFromSeries = (
  series: CalendarEvent,
  seriesDate: string,
  scope: Scope,
  all: CalendarEvent[],
  stamp: number,
): SeriesChange => {
  if (
    scope === "all" ||
    (scope === "following" && seriesDate <= firstDate(series))
  ) {
    return wholeSeries(series, all)
  }

  if (scope === "following") {
    const { head, later } = cut(series, seriesDate, all)

    return {
      put: [{ ...head, updatedAt: stamp }],
      remove: later.map(event => event.id),
    }
  }

  return { put: [exclude(series, seriesDate, stamp)], remove: [] }
}

const editOne = (
  series: CalendarEvent,
  seriesDate: string,
  draft: CalendarEvent,
  stamp: number,
): CalendarEvent => ({
  ...draft,
  id: crypto.randomUUID(),
  recurrence: "none",
  shift: null,
  exdates: [],
  until: null,
  done: series.done.includes(seriesDate) ? [draft.start.slice(0, 10)] : [],
  seriesId: series.id,
  originalDate: seriesDate,
  updatedAt: stamp,
})

const moveFrom = (
  series: CalendarEvent,
  draft: CalendarEvent,
  occurrence: Occurrence,
  following: boolean,
  from: string,
  later: CalendarEvent[],
  stamp: number,
) => {
  const shiftDays = dayDelta(occurrence.start, draft.start)
  const carried = (days: string[]) =>
    days.filter(day => day >= from).map(day => rekey(day, shiftDays))
  const moved: CalendarEvent = {
    ...draft,
    ...placed(draft, addDays(parseLocal(from), shiftDays)),
    id: following ? crypto.randomUUID() : series.id,
    exdates: carried(series.exdates),
    done: carried(series.done),
    until: series.until && rekey(series.until, shiftDays),
    updatedAt: stamp,
  }

  return {
    moved,
    later: later.map(event => ({
      ...event,
      seriesId: moved.id,
      originalDate: event.originalDate && rekey(event.originalDate, shiftDays),
      updatedAt: stamp,
    })),
  }
}

export const editInSeries = (
  series: CalendarEvent,
  occurrence: Occurrence,
  draft: CalendarEvent,
  scope: Scope,
  all: CalendarEvent[],
  stamp: number,
): SeriesChange & { edited: CalendarEvent } => {
  const seriesDate = occurrence.seriesDate ?? firstDate(series)

  if (scope === "one") {
    const edited = editOne(series, seriesDate, draft, stamp)

    return {
      put: [exclude(series, seriesDate, stamp), edited],
      remove: [],
      edited,
    }
  }

  const following = scope === "following" && seriesDate > firstDate(series)
  const from = following ? seriesDate : firstDate(series)
  const { head, later } = following
    ? cut(series, seriesDate, all)
    : { head: null, later: childrenOf(all, series.id) }
  const moved = moveFrom(
    series,
    draft,
    occurrence,
    following,
    from,
    later,
    stamp,
  )

  return {
    put: [
      ...(head ? [{ ...head, updatedAt: stamp }] : []),
      moved.moved,
      ...moved.later,
    ],
    remove: [],
    edited: moved.moved,
  }
}

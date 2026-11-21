export const RECURRENCES = [
  "none",
  "daily",
  "weekdays",
  "weekly",
  "monthly",
  "yearly",
] as const

export type Recurrence = (typeof RECURRENCES)[number]

export const SHIFTS = ["next", "previous"] as const

export type Shift = (typeof SHIFTS)[number]

export type CalendarEvent = {
  id: string
  title: string
  notes: string
  start: string
  end: string
  allDay: boolean
  color: string
  recurrence: Recurrence
  tags: string[]
  exdates: string[]
  until: string | null
  shift: Shift | null
  seriesId: string | null
  originalDate: string | null
  notesSync: boolean
  createdBy: string
  updatedAt: number
}

export type Occurrence = CalendarEvent & {
  seriesDate?: string
  shiftedFrom?: string
}

export type HolidayCheck = (day: Date) => boolean

export type Scope = "one" | "following" | "all"

export type SeriesChange = { put: CalendarEvent[]; remove: string[] }

export const DAY_MS = 86_400_000
export const SHIFT_LIMIT = 14
const SHIFTABLE: Recurrence[] = ["weekly", "monthly", "yearly"]

export const pad = (n: number) => String(n).padStart(2, "0")

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const dateTimeKey = (d: Date) =>
  `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

// date-only ISO strings parse as UTC midnight; all-day dates must stay local
export const parseLocal = (value: string) => {
  if (value.length === 10) {
    const [year, month, day] = value.split("-").map(Number)

    return new Date(year, month - 1, day)
  }

  return new Date(value)
}

export const isDayKey = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length === 10 &&
  dateKey(parseLocal(value)) === value

export const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const addDays = (d: Date, n: number) => {
  const next = new Date(d)

  next.setDate(next.getDate() + n)

  return next
}

export const dayDelta = (from: string, to: string) =>
  Math.round(
    (startOfDay(parseLocal(to)).getTime() -
      startOfDay(parseLocal(from)).getTime()) /
      DAY_MS,
  )

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

export const shiftable = (recurrence: Recurrence) =>
  SHIFTABLE.includes(recurrence)

const shiftStep = (event: CalendarEvent) => {
  if (!shiftable(event.recurrence)) {
    return 0
  }

  return event.shift === "next" ? 1 : event.shift === "previous" ? -1 : 0
}

export const openEnded = (event: CalendarEvent) =>
  !event.allDay &&
  parseLocal(event.end).getTime() === parseLocal(event.start).getTime()

export const span = (event: CalendarEvent) => {
  const start = parseLocal(event.start)
  const rawEnd = parseLocal(event.end)
  const latest = new Date(Math.max(start.getTime(), rawEnd.getTime()))
  const end = event.allDay ? addDays(startOfDay(latest), 1) : latest

  return { start, end }
}

const inWindow = (start: Date, end: Date, from: Date, to: Date) =>
  start < to && (end > from || start >= from)

const occurrenceOf = (
  event: CalendarEvent,
  start: Date,
  end: Date,
): Occurrence => ({
  ...event,
  start: event.allDay ? dateKey(start) : dateTimeKey(start),
  end: event.allDay ? dateKey(addDays(end, -1)) : dateTimeKey(end),
})

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

    // a long holiday run must not push one occurrence onto its neighbor's day
    if (
      moved !== raw &&
      (step > 0 ? moved >= neighbor : moved < addDays(neighbor, 1))
    ) {
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
      ...(moved === raw ? {} : { shiftedFrom: key }),
    })
  }

  return found
}

export const inSeries = (event: CalendarEvent) =>
  event.recurrence !== "none" || !!event.seriesId

export const shifted = (event: CalendarEvent) => shiftStep(event) !== 0

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
  parseLocal(a.start).getTime() - parseLocal(b.start).getTime()

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

const childrenOf = (all: CalendarEvent[], seriesId: string) =>
  all.filter(event => event.seriesId === seriesId)

const firstDate = (series: CalendarEvent) => dateKey(parseLocal(series.start))

const dayBefore = (key: string) => dateKey(addDays(parseLocal(key), -1))

// ponytail: a plain day shift; a monthly series moved across a month-end clamp can leave a rekeyed exception unmatched
const rekey = (key: string, days: number) =>
  days === 0 ? key : dateKey(addDays(parseLocal(key), days))

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
    return {
      put: [],
      remove: [series.id, ...childrenOf(all, series.id).map(event => event.id)],
    }
  }

  if (scope === "following") {
    const { head, later } = cut(series, seriesDate, all)

    return {
      put: [{ ...head, updatedAt: stamp }],
      remove: later.map(event => event.id),
    }
  }

  return {
    put: [
      {
        ...series,
        exdates: [...new Set([...series.exdates, seriesDate])],
        updatedAt: stamp,
      },
    ],
    remove: [],
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
  const shiftDays = dayDelta(occurrence.start, draft.start)

  if (scope === "one") {
    const { put } = removeFromSeries(series, seriesDate, "one", all, stamp)
    const edited: CalendarEvent = {
      ...draft,
      id: crypto.randomUUID(),
      recurrence: "none",
      shift: null,
      exdates: [],
      until: null,
      seriesId: series.id,
      originalDate: seriesDate,
      updatedAt: stamp,
    }

    return { put: [...put, edited], remove: [], edited }
  }

  const following = scope === "following" && seriesDate > firstDate(series)
  const from = following ? seriesDate : firstDate(series)
  const { head, later } = following
    ? cut(series, seriesDate, all)
    : { head: null, later: childrenOf(all, series.id) }
  const moved: CalendarEvent = {
    ...draft,
    ...placed(draft, addDays(parseLocal(from), shiftDays)),
    id: following ? crypto.randomUUID() : series.id,
    exdates: series.exdates
      .filter(day => day >= from)
      .map(day => rekey(day, shiftDays)),
    until: series.until && rekey(series.until, shiftDays),
    updatedAt: stamp,
  }

  return {
    put: [
      ...(head ? [{ ...head, updatedAt: stamp }] : []),
      moved,
      ...later.map(event => ({
        ...event,
        seriesId: moved.id,
        originalDate:
          event.originalDate && rekey(event.originalDate, shiftDays),
        updatedAt: stamp,
      })),
    ],
    remove: [],
    edited: moved,
  }
}

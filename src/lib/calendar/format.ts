import { getLocale } from "#lib/paraglide/runtime.js"
import { dateKey, parseLocal } from "./dates.ts"
import { openEnded } from "./occurrence.ts"
import type { CalendarEvent } from "./types.ts"

export const format = (d: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(getLocale(), options).format(d)

const format24 = new Intl.DateTimeFormat(getLocale(), {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

export const clock = (value: string) => format24.format(parseLocal(value))

export const shortDay = (day: Date) =>
  format(day, { month: "short", day: "numeric", weekday: "short" })

export const longDay = (day: Date) =>
  format(day, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })

export const eventSpan = (event: CalendarEvent, allDayLabel: string) => {
  const start = parseLocal(event.start)
  const end = parseLocal(event.end)
  const sameDay = dateKey(start) === dateKey(end)

  if (event.allDay) {
    return sameDay ? allDayLabel : `${shortDay(start)} – ${shortDay(end)}`
  }

  if (openEnded(event)) {
    return clock(event.start)
  }

  if (sameDay) {
    return `${clock(event.start)} – ${clock(event.end)}`
  }

  return `${shortDay(start)} ${clock(event.start)} – ${shortDay(end)} ${clock(event.end)}`
}

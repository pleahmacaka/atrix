import { getLocale } from "#lib/paraglide/runtime.js"
import {
  type CalendarEvent,
  dateKey,
  openEnded,
  parseLocal,
} from "./recurrence.ts"

export const format = (d: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(getLocale(), options).format(d)

export const clock = (value: string) =>
  parseLocal(value).toLocaleTimeString(getLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })

export const eventTime = (event: CalendarEvent, allDayLabel: string) =>
  event.allDay ? allDayLabel : clock(event.start)

export const shortDay = (day: Date) =>
  format(day, { month: "short", day: "numeric", weekday: "short" })

export const longDay = (day: Date) =>
  format(day, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })

export const dateLabel = (day: Date, today: Date) =>
  format(day, {
    year: day.getFullYear() === today.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
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

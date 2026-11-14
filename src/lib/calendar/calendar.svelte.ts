import { getLocale } from "#lib/paraglide/runtime.js"
import type { CalendarEvent } from "./events.ts"

export const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export const monthOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

export const sameDay = (a: Date, b: Date) =>
  a.toDateString() === b.toDateString()

export const monthGrid = (month: Date) => {
  const start = addDays(month, -month.getDay())

  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export const onDay = (e: CalendarEvent, day: Date) => {
  const from = day.toISOString()
  const to = addDays(day, 1).toISOString()

  return (
    e.start < to && (e.end > from || (e.start === e.end && e.start >= from))
  )
}

const pad = (n: number) => String(n).padStart(2, "0")

export const dateValue = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const timeValue = (d: Date) =>
  `${dateValue(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export const format = (d: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(getLocale(), options).format(d)

export const timeRange = (e: CalendarEvent) => {
  const clock = { hour: "numeric", minute: "2-digit" } as const

  return `${format(new Date(e.start), clock)} – ${format(new Date(e.end), clock)}`
}

export const TONES: Record<string, string> = {
  "": "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
}

const today = addDays(new Date(), 0)

export const calendar = $state({ month: monthOf(today), selected: today })

export const pick = (day: Date) => {
  calendar.selected = day

  if (!sameDay(monthOf(day), calendar.month)) {
    calendar.month = monthOf(day)
  }
}

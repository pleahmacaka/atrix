export const RECURRENCES = [
  "none",
  "daily",
  "weekdays",
  "weekly",
  "monthly",
  "yearly",
] as const

export type Recurrence = (typeof RECURRENCES)[number]

export const SHIFT_LIMIT = 14

export const SHIFTS = ["next", "previous"] as const

export type Shift = (typeof SHIFTS)[number]

export type Scope = "one" | "following" | "all"

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

export type SeriesChange = { put: CalendarEvent[]; remove: string[] }

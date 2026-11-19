import { dateKey, dateTimeKey } from "./dates.ts"
import type { CalendarEvent } from "./types.ts"

const NEW_EVENT_HOUR = 9

export const blankDraft = (day: Date): CalendarEvent => {
  const start = new Date(day)

  start.setHours(NEW_EVENT_HOUR, 0, 0, 0)

  const end = new Date(start)

  end.setHours(NEW_EVENT_HOUR + 1)

  return {
    id: crypto.randomUUID(),
    title: "",
    notes: "",
    start: dateTimeKey(start),
    end: dateTimeKey(end),
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
    reminder: null,
    task: false,
    done: [],
    parentId: null,
    group: null,
    order: null,
    createdBy: "",
    updatedAt: 0,
  }
}

export const allDayDraft = (day: Date, title: string): CalendarEvent => ({
  ...blankDraft(day),
  title,
  allDay: true,
  start: dateKey(day),
  end: dateKey(day),
})

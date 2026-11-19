import { m } from "#lib/paraglide/messages.js"
import type { Recurrence, Shift } from "./types.ts"

export const RECURRENCE_LABELS: Record<Recurrence, () => string> = {
  none: m.calendar_recurrence_none,
  daily: m.calendar_recurrence_daily,
  weekdays: m.calendar_recurrence_weekdays,
  weekly: m.calendar_recurrence_weekly,
  monthly: m.calendar_recurrence_monthly,
  yearly: m.calendar_recurrence_yearly,
}

export const SHIFT_LABELS: Record<Shift | "", () => string> = {
  "": m.calendar_shift_none,
  next: m.calendar_shift_next,
  previous: m.calendar_shift_previous,
}

export const reminderLabel = (minutes: number | null) => {
  switch (minutes) {
    case null:
      return m.panel_reminder_none()
    case 0:
      return m.panel_reminder_start()
    case 60:
      return m.panel_reminder_hour()
    case 1440:
      return m.panel_reminder_day()
    default:
      return m.panel_reminder_minutes({ count: minutes })
  }
}

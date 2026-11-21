import { z } from "zod"
import { getLocale } from "#lib/paraglide/runtime.js"
import { persist, persisted } from "#lib/store/stored.svelte.ts"
import {
  blueSaturday,
  holidayCheck,
  holidaysOn,
  loadHolidays,
  regionOf,
  restDayOf,
} from "./holidays.ts"
import { addDays, DAY_MS, startOfDay } from "./recurrence.ts"

export const WEEKS = 4

export type WeekStart = 0 | 1

const PREFS = "calendar-prefs"

const prefsSchema = z.object({
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  weekNumbers: z.boolean(),
  region: z.string(),
  androidSync: z.boolean(),
})

type Prefs = z.infer<typeof prefsSchema>

const legacy = (key: string, fallback: string) =>
  localStorage.getItem(key) ?? fallback

const DEFAULTS: Prefs = {
  weekStartsOn: 0,
  weekNumbers: false,
  region: "system",
  androidSync: false,
}

const stored = persisted<Prefs>(
  PREFS,
  {
    weekStartsOn: legacy("calendar-week-start", "0") === "1" ? 1 : 0,
    weekNumbers: legacy("calendar-week-numbers", "off") === "on",
    region: legacy("calendar-region", "system"),
    androidSync: legacy("calendar-android-sync", "off") === "on",
  },
  prefsSchema,
)

class CalendarPrefs {
  weekStartsOn = $state<WeekStart>(stored.weekStartsOn)

  weekNumbers = $state(stored.weekNumbers)

  region = $state(stored.region)

  androidSync = $state(stored.androidSync)

  #save = () =>
    persist<Prefs>(
      PREFS,
      {
        weekStartsOn: this.weekStartsOn,
        weekNumbers: this.weekNumbers,
        region: this.region,
        androidSync: this.androidSync,
      },
      DEFAULTS,
    )

  setWeekStart = (day: WeekStart) => {
    this.weekStartsOn = day
    this.#save()
    calendar.start = startFor(calendar.selected)
  }

  setWeekNumbers = (on: boolean) => {
    this.weekNumbers = on
    this.#save()
  }

  setRegion = (region: string) => {
    this.region = region
    this.#save()
  }

  setAndroidSync = (on: boolean) => {
    this.androidSync = on
    this.#save()
  }
}

export const prefs = new CalendarPrefs()

export const sameDay = (a: Date, b: Date) =>
  a.toDateString() === b.toDateString()

const weekOf = (d: Date) =>
  addDays(startOfDay(d), -((d.getDay() - prefs.weekStartsOn + 7) % 7))

export const weeksFrom = (start: Date) =>
  Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i))

export const isoWeek = (day: Date) => {
  const at = new Date(
    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()),
  )

  at.setUTCDate(at.getUTCDate() + 4 - (at.getUTCDay() || 7))

  const yearStart = Date.UTC(at.getUTCFullYear(), 0, 1)

  return Math.ceil(((at.getTime() - yearStart) / DAY_MS + 1) / 7)
}

class HolidayView {
  ready = $state(false)

  region = $derived(this.ready ? regionOf(prefs.region) : "")

  isHoliday = $derived(this.ready ? holidayCheck(prefs.region) : () => false)

  restDay = $derived(this.ready ? restDayOf(this.region) : 0)

  load = () => loadHolidays().then(() => (this.ready = true))

  namesOn = (day: Date) =>
    this.ready ? holidaysOn(day, this.region, getLocale().split("-")[0]) : []

  weekdayTone = (day: Date) =>
    day.getDay() === this.restDay
      ? "text-error"
      : blueSaturday(this.region) && day.getDay() === 6
        ? "text-info"
        : null

  dayTone = (day: Date) =>
    this.isHoliday(day) ? "text-error" : this.weekdayTone(day)
}

export const holidays = new HolidayView()

const today = startOfDay(new Date())

const startFor = (day: Date) => addDays(weekOf(day), -7)

export const calendar = $state({ start: startFor(today), selected: today })

export const pick = (day: Date) => {
  calendar.selected = day

  const end = addDays(calendar.start, WEEKS * 7)

  if (day < calendar.start || day >= end) {
    calendar.start = startFor(day)
  }
}

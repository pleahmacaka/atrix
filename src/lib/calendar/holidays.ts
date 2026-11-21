import type Holidays from "date-holidays"
import { DAY_MS, dateKey as dayKey } from "./recurrence.ts"

const engines = new Map<string, Holidays>()

let Engine: typeof Holidays | null = null

let loading: Promise<void> | null = null

// every country's rules ship in one 1.4 MB module, so it loads only when the calendar needs it
export const loadHolidays = () => {
  loading ??= import("date-holidays").then(module => {
    Engine = module.default
  })

  return loading
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]

const BLUE_SATURDAY = new Set(["KR", "JP", "TW"])

const engine = (country: string, lang: string) => {
  if (!Engine) {
    return null
  }

  const key = `${country}:${lang}`
  let hd = engines.get(key)

  if (!hd) {
    hd = new Engine(country)

    try {
      hd.setLanguages(lang)
    } catch {}

    engines.set(key, hd)
  }

  return hd
}

export const systemRegion = () => {
  const candidates = [
    Intl.DateTimeFormat().resolvedOptions().locale,
    ...(globalThis.navigator?.languages ?? []),
  ]

  for (const tag of candidates) {
    try {
      const region = new Intl.Locale(tag).maximize().region

      if (region) {
        return region
      }
    } catch {}
  }

  return "US"
}

type Entry = { name: string; type: string }

const years = new Map<string, Map<string, Entry[]>>()

// isHoliday() reads a date in the region's timezone, so a device ahead of it lands a day late
const yearOf = (year: number, region: string, lang: string) => {
  const key = `${region}:${lang}:${year}`
  let byDay = years.get(key)

  if (!byDay) {
    byDay = new Map()

    try {
      for (const holiday of engine(region, lang)?.getHolidays(year) ?? []) {
        const [y, m, d] = holiday.date.slice(0, 10).split("-").map(Number)
        const length = Math.max(
          1,
          Math.round(
            (holiday.end.getTime() - holiday.start.getTime()) / DAY_MS,
          ),
        )

        for (let i = 0; i < length; i++) {
          const day = dayKey(new Date(y, m - 1, d + i))

          byDay.set(day, [...(byDay.get(day) ?? []), holiday])
        }
      }
    } catch {}

    if (Engine) {
      years.set(key, byDay)
    }
  }

  return byDay
}

const holidaysAt = (day: Date, region: string, lang: string) =>
  yearOf(day.getFullYear(), region, lang).get(dayKey(day)) ?? []

export const holidaysOn = (day: Date, region: string, lang: string) => [
  ...new Set(holidaysAt(day, region, lang).map(holiday => holiday.name)),
]

export const regionOf = (region: string) =>
  region === "system" ? systemRegion() : region

export const holidayCheck = (region: string) => {
  const resolved = regionOf(region)

  return (day: Date) =>
    holidaysAt(day, resolved, "en").some(holiday => holiday.type === "public")
}

export const restDayOf = (region: string) => {
  const name = engine(region, "en")?.getDayOff()?.toLowerCase()

  return name ? WEEKDAYS.indexOf(name) : 0
}

export const blueSaturday = (region: string) => BLUE_SATURDAY.has(region)

export const regions = (): string[] =>
  Engine ? Object.keys(new Engine().getCountries()).sort() : []

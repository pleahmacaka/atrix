import { getLocale } from "#lib/paraglide/runtime.js"
import { addDays, dateKey, dayDelta, parseLocal, startOfDay } from "./dates.ts"
import { format } from "./format.ts"

const DAY_WORDS: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  오늘: 0,
  내일: 1,
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

const FULL_WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]

const WEEK = 7

const isDayKey = (word: string) =>
  word.length === 10 && dateKey(parseLocal(word)) === word

const dayOf = (token: string, today: Date) => {
  const word = token.toLowerCase()

  if (Object.hasOwn(DAY_WORDS, word)) {
    return addDays(today, DAY_WORDS[word])
  }

  const weekday = Math.max(WEEKDAYS.indexOf(word), FULL_WEEKDAYS.indexOf(word))

  if (weekday >= 0) {
    return addDays(today, ((weekday - today.getDay() + WEEK - 1) % WEEK) + 1)
  }

  return isDayKey(word) ? parseLocal(word) : null
}

export const quickTask = (text: string, now = new Date()) => {
  const today = startOfDay(now)
  const words: string[] = []
  let due: string | null = null

  for (const token of text.trim().split(" ").filter(Boolean)) {
    const day = dayOf(token, today)

    if (day) {
      due = dateKey(day)
    } else {
      words.push(token)
    }
  }

  const title = words.join(" ")

  return title ? { title, due } : null
}

export const dueLabel = (due: string, now = new Date()) => {
  const day = parseLocal(due)
  const distance = dayDelta(dateKey(now), due)

  if (Math.abs(distance) <= 1) {
    const label = new Intl.RelativeTimeFormat(getLocale(), {
      numeric: "auto",
    }).format(distance, "day")

    return `${label.charAt(0).toLocaleUpperCase(getLocale())}${label.slice(1)}`
  }

  if (distance > 1 && distance < WEEK) {
    return format(day, { weekday: "short" })
  }

  return format(day, {
    month: "short",
    day: "numeric",
    year: day.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })
}

import { getLocale } from "#lib/paraglide/runtime.js"
import {
  addDays,
  dateKey,
  dateTimeKey,
  dayDelta,
  parseLocal,
  startOfDay,
} from "./dates.ts"
import { blankDraft } from "./draft.ts"
import { clock, format } from "./format.ts"
import { parseTimeToken, withoutToken } from "./timeparse.ts"
import type { CalendarEvent } from "./types.ts"

export type Todo = { title: string; due: string | null }

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

export const quickTodo = (text: string, now = new Date()): Todo | null => {
  const today = startOfDay(now)
  const time = parseTimeToken(text)
  const rest = time ? withoutToken(text, time) : text
  const words: string[] = []
  let day: Date | null = null

  for (const token of rest.trim().split(" ").filter(Boolean)) {
    const found = dayOf(token, today)

    if (found) {
      day = found
    } else {
      words.push(token)
    }
  }

  const title = words.join(" ")

  if (!title) {
    return null
  }

  if (!time) {
    return { title, due: day && dateKey(day) }
  }

  const at = new Date(day ?? today)

  at.setMinutes(time.minutes)

  return { title, due: dateTimeKey(at) }
}

export const todoEvent = (todo: Todo, now = new Date()): CalendarEvent => {
  const start = todo.due ?? dateKey(now)

  return {
    ...blankDraft(now),
    title: todo.title,
    start,
    end: start,
    allDay: !start.includes("T"),
    task: true,
    updatedAt: now.getTime(),
  }
}

export const dueLabel = (due: string, now = new Date()) => {
  const day = parseLocal(due)
  const distance = dayDelta(dateKey(now), due)
  const time = due.includes("T") ? ` ${clock(due)}` : ""

  if (Math.abs(distance) <= 1) {
    const label = new Intl.RelativeTimeFormat(getLocale(), {
      numeric: "auto",
    }).format(distance, "day")

    return `${label.charAt(0).toLocaleUpperCase(getLocale())}${label.slice(1)}${time}`
  }

  if (distance > 1 && distance < WEEK) {
    return `${format(day, { weekday: "short" })}${time}`
  }

  return `${format(day, {
    month: "short",
    day: "numeric",
    year: day.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })}${time}`
}

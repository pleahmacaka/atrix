import { z } from "zod"
import { errorText } from "#lib/components/ui/attempt.svelte.ts"
import { logFailure } from "#lib/logging.ts"
import { native } from "#lib/native.ts"
import { desktop } from "#lib/platform.ts"
import { SUBMIT_HOURS, settings } from "./settings.svelte.ts"

const REFRESH_MS = 10 * 60_000

const statsSchema = z.object({
  days: z.array(z.object({ date: z.string(), tokens: z.number().catch(0) })),
})

export type Day = { date: string; tokens: number; level: number }

const iso = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")

const levelOf = (tokens: number, top: number) => {
  const ratio = top > 0 ? tokens / top : 0

  return ratio >= 0.75
    ? 4
    : ratio >= 0.5
      ? 3
      : ratio >= 0.25
        ? 2
        : ratio > 0
          ? 1
          : 0
}

class UsageGraph {
  days = $state<Day[]>([])

  total = $state(0)

  loading = $state(false)

  failure = $state<string | null>(null)

  #loadedAt = 0

  reset = () => {
    this.#loadedAt = 0
    this.failure = null
  }

  load = async () => {
    if (!desktop || !settings.tokscale || this.loading) {
      return
    }

    if (Date.now() - this.#loadedAt < REFRESH_MS) {
      return
    }

    this.#loadedAt = Date.now()

    this.loading = true
    this.failure = null

    try {
      const today = new Date()
      const start = new Date(today)

      start.setDate(today.getDate() - today.getDay() - 7 * 52)

      const raw = await native<string>("usage_graph")
      const parsed = statsSchema.parse(JSON.parse(raw))
      const tokens = new Map(parsed.days.map(d => [d.date, d.tokens]))
      const top = Math.max(0, ...tokens.values())
      const days: Day[] = []

      for (
        const day = new Date(start);
        day <= today;
        day.setDate(day.getDate() + 1)
      ) {
        const used = tokens.get(iso(day)) ?? 0

        days.push({ date: iso(day), tokens: used, level: levelOf(used, top) })
      }

      this.days = days
      this.total = days.reduce((sum, d) => sum + d.tokens, 0)
    } catch (e) {
      this.#loadedAt = 0
      this.failure = errorText(e)
    } finally {
      this.loading = false
    }
  }
}

export const usageGraph = new UsageGraph()

export const submission = $state({ failure: null as string | null })

const SUBMITTED = "tokscale-submitted"

const CHECK_MS = 10 * 60_000

const HOUR_MS = 60 * 60_000

const submittedAt = () => Number(localStorage.getItem(SUBMITTED)) || 0

const adoptSchedule = async () => {
  const minutes = await native<number>("usage_adopt_schedule").catch(e => {
    logFailure("tokscale adopt", e)

    return 0
  })
  const hours = minutes / 60

  if (SUBMIT_HOURS.includes(hours)) {
    settings.setTokscaleSubmit(hours)
  }
}

const submitDue = async () => {
  const hours = settings.tokscaleSubmit

  if (!settings.tokscale || hours === 0) {
    return
  }

  if (Date.now() - submittedAt() < hours * HOUR_MS) {
    return
  }

  localStorage.setItem(SUBMITTED, String(Date.now()))

  try {
    await native("usage_submit")
    submission.failure = null
  } catch (e) {
    submission.failure = errorText(e)
    logFailure("tokscale submit", e)
  }
}

export const startTokscaleSubmit = () => {
  if (!desktop) {
    return
  }

  const ready = settings.tokscale ? adoptSchedule() : Promise.resolve()

  ready.then(submitDue)

  const timer = setInterval(submitDue, CHECK_MS)

  return () => clearInterval(timer)
}

export const scheduleSubmit = (hours: number) => {
  settings.setTokscaleSubmit(hours)
  submitDue()
}

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

export const syncSubmit = async () => {
  const minutes = await native<number>("usage_autosubmit_status").catch(
    () => null,
  )
  const hours = minutes === null || minutes % 60 !== 0 ? null : minutes / 60

  if (hours === 0 || SUBMIT_HOURS.includes(hours ?? -1)) {
    settings.setTokscaleSubmit(hours ?? 0)
  }
}

export const scheduleSubmit = async (hours: number) => {
  submission.failure = null

  try {
    await native("usage_autosubmit", { hours })
    settings.setTokscaleSubmit(hours)

    return true
  } catch (e) {
    submission.failure = errorText(e)
    logFailure("tokscale autosubmit", e)

    return false
  }
}

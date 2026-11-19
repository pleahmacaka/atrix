import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
]

export const relativeTime = (at: number, now = Date.now()) => {
  const gap = now - at
  const unit = UNITS.find(([, ms]) => gap >= ms)

  return unit
    ? new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" }).format(
        -Math.floor(gap / unit[1]),
        unit[0],
      )
    : m.launcher_clip_just_now()
}

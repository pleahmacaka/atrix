import { getLocale } from "#lib/paraglide/runtime.js"

const units = [
  { unit: "day", ms: 86_400_000 },
  { unit: "hour", ms: 3_600_000 },
  { unit: "minute", ms: 60_000 },
] as const

export const compact = (value: number) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)

export const elapsed = (since: number, now = Date.now()) => {
  const gap = Math.max(0, now - since)
  const index = units.findIndex(({ ms }) => gap >= ms)
  const { unit, ms } = units[index] ?? units[2]
  const format = new Intl.NumberFormat(getLocale(), {
    style: "unit",
    unit,
    unitDisplay: "narrow",
  })

  return gap < ms ? `<${format.format(1)}` : format.format(Math.floor(gap / ms))
}

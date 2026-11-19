export const DAY_MS = 86_400_000

export const pad = (n: number) => String(n).padStart(2, "0")

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const dateTimeKey = (d: Date) =>
  `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export const parseLocal = (value: string) =>
  value.length === 10 ? new Date(`${value}T00:00`) : new Date(value)

export const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const addDays = (d: Date, n: number) => {
  const next = new Date(d)

  next.setDate(next.getDate() + n)

  return next
}

export const dayDelta = (from: string, to: string) =>
  Math.round(
    (startOfDay(parseLocal(to)).getTime() -
      startOfDay(parseLocal(from)).getTime()) /
      DAY_MS,
  )

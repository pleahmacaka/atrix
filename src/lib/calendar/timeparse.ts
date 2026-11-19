export type TimeToken = {
  start: number
  end: number
  minutes: number
}

const PM = ["오후", "저녁", "밤", "pm"]

const AM = ["오전", "아침", "새벽", "am"]

const PATTERNS = [
  /(?<meridiem>오전|오후|아침|저녁|밤|새벽)?\s*(?<hour>\d{1,2})\s*시(?!간)(?:\s*(?<minute>\d{1,2})\s*분|\s*(?<half>반))?/,
  /(?<meridiem>오전|오후)?\s*\b(?<hour>\d{1,2}):(?<minute>\d{2})(?!\d)(?:\s*(?<suffix>am|pm)\b)?/i,
  /\b(?<hour>\d{1,2})\s*(?<suffix>am|pm)\b/i,
]

const toMinutes = (groups: Record<string, string | undefined>) => {
  let hour = Number(groups.hour)
  const minute = groups.half ? 30 : Number(groups.minute ?? 0)
  const meridiem = (groups.meridiem ?? groups.suffix ?? "").toLowerCase()

  if (hour > 23 || minute > 59) {
    return null
  }

  if (PM.includes(meridiem) && hour < 12) {
    hour += 12
  } else if (AM.includes(meridiem) && hour === 12) {
    hour = 0
  }

  return hour * 60 + minute
}

export const parseTimeToken = (text: string): TimeToken | null => {
  let best: TimeToken | null = null

  for (const pattern of PATTERNS) {
    const match = pattern.exec(text)
    const minutes = match?.groups ? toMinutes(match.groups) : null

    if (!match || minutes === null) {
      continue
    }

    const lead = match[0].length - match[0].trimStart().length
    const start = match.index + lead
    const end = match.index + match[0].trimEnd().length

    if (
      !best ||
      start < best.start ||
      (start === best.start && end > best.end)
    ) {
      best = { start, end, minutes }
    }
  }

  return best
}

export const withoutToken = (text: string, token: TimeToken) =>
  `${text.slice(0, token.start)} ${text.slice(token.end)}`
    .split(" ")
    .filter(word => word.trim() !== "")
    .join(" ")

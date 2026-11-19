import { setVolume } from "#lib/desktop/native/media.js"

export const volumeIcon = (level: number, muted: boolean) => {
  if (muted) {
    return "lucide:volume-x"
  }

  if (level <= 0) {
    return "lucide:volume"
  }

  return level < 0.5 ? "lucide:volume-1" : "lucide:volume-2"
}

export const latest = <T>(send: (value: T) => Promise<unknown>) => {
  let next: { value: T } | null = null
  let busy = false

  const drain = async () => {
    busy = true

    while (next) {
      const { value } = next

      next = null
      await send(value).catch(() => undefined)
    }

    busy = false
  }

  return (value: T) => {
    next = { value }

    if (!busy) {
      drain()
    }
  }
}

export const sendVolume = latest(setVolume)

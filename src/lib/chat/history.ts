const HISTORY_LIMIT = 12000

const clip = (entry: string, limit: number) => {
  if (entry.length <= limit) {
    return entry
  }

  const cut = entry.indexOf("\n")
  const head = cut === -1 || cut + 2 >= limit ? "" : entry.slice(0, cut + 1)

  return `${head}…${entry.slice(-(limit - head.length - 1))}`
}

export const tailEntries = (entries: string[], limit = HISTORY_LIMIT) => {
  const kept: string[] = []
  let size = 0

  for (const entry of entries.toReversed()) {
    size += entry.length + 2

    if (size > limit && kept.length > 0) {
      break
    }

    kept.unshift(clip(entry, limit))
  }

  return kept.join("\n\n")
}

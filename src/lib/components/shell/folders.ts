import type { Browse } from "#lib/p2p/protocol.ts"
import { baseName } from "#lib/path.ts"

const RECENT_LIMIT = 6

const RECENT_BROWSING = 3

const isPath = (text: string) =>
  text.startsWith("/") ||
  text.startsWith("~") ||
  text.startsWith("\\") ||
  /^[a-z]:[\\/]/i.test(text)

const nativePath = (path: string) =>
  /^[a-z]:/i.test(path) ? path.replaceAll("/", "\\") : path

const isTemporary = (path: string) =>
  path.toLowerCase().includes("\\appdata\\local\\temp\\")

const unique = (paths: string[]) => {
  const seen = new Set<string>()

  return paths.filter(path => {
    const key = path.toLowerCase()

    if (seen.has(key)) {
      return false
    }

    seen.add(key)

    return true
  })
}

export const parentOf = (path: string) => {
  const cut = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) + 1

  return { dir: path.slice(0, cut), leaf: path.slice(cut) }
}

export const startOf = (text: string) => {
  const typed = text.trim()

  return isPath(typed) ? parentOf(typed) : null
}

export const needleOf = (text: string) =>
  (startOf(text)?.leaf ?? text.trim()).toLowerCase()

export const dirsOf = (browse: Browse | null, needle: string) =>
  (browse?.dirs ?? []).filter(dir => dir.name.toLowerCase().includes(needle))

export const recentsOf = (
  recent: (string | null)[],
  needle: string,
  browsing: boolean,
) =>
  unique(
    recent
      .flatMap(path => (path ? [nativePath(path)] : []))
      .filter(path => !isTemporary(path)),
  )
    .filter(path => baseName(path).toLowerCase().includes(needle))
    .slice(0, browsing ? RECENT_BROWSING : RECENT_LIMIT)

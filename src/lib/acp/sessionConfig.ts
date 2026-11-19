import { matchChoice } from "#lib/chat/choices.ts"
import { olderModels, versionOf } from "#lib/chat/versions.ts"
import type { SessionView } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

type Configured = Pick<SessionView, "config" | "pinned">

export const OPTION_NAMES: Record<string, () => string> = {
  model: m.chat_model,
  thought_level: m.chat_effort,
}

const PINNED = new Set(["model", "thought_level"])

export const newestMatch = (
  values: { value: string; name: string }[],
  wanted: string,
) => {
  const older = olderModels(values)
  const rank = (v: { name: string }) =>
    versionOf(v.name) && !older.has(v.name) ? 0 : 1

  return matchChoice(
    values.toSorted((a, b) => rank(a) - rank(b)),
    wanted,
  )
}

const categoryOf = (session: Configured, configId: string) =>
  session.config.find(o => o.id === configId)?.category

export const isModel = (session: Configured, configId: string) =>
  categoryOf(session, configId) === "model"

export const isPinned = (session: Configured, configId: string) =>
  !!session.pinned && PINNED.has(categoryOf(session, configId) ?? "")

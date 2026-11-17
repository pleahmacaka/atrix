import { m } from "#lib/paraglide/messages.js"
import type { Actor } from "./document.ts"

export const actorName = (actor: Actor | null) =>
  !actor
    ? m.knowledge_none()
    : actor.kind === "human"
      ? (actor.user ?? `${m.knowledge_human()} (${actor.device})`)
      : (actor.agent ?? actor.session ?? actor.device)

export const actorDetail = (actor: Actor | null) =>
  actor?.kind === "agent"
    ? [actor.model?.id, actor.harness?.name, actor.device]
        .filter(Boolean)
        .join(", ")
    : (actor?.device ?? "")

export const timeOf = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
]

export const timeAgo = (iso: string) => {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  const [unit, size] = STEPS.find(([, s]) => Math.abs(seconds) >= s) ?? [
    "second",
    1,
  ]

  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round(seconds / size),
    unit,
  )
}

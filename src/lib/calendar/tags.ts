import { m } from "#lib/paraglide/messages.js"
import type { EventTag } from "./store.ts"
import type { CalendarEvent } from "./types.ts"

export const COLORS = {
  "": { chip: "bg-primary", label: m.calendar_color_primary },
  info: { chip: "bg-info", label: m.calendar_color_info },
  warning: { chip: "bg-warning", label: m.calendar_color_warning },
  success: { chip: "bg-success", label: m.calendar_color_success },
  error: { chip: "bg-error", label: m.calendar_color_error },
  violet: { chip: "bg-violet-400", label: m.calendar_color_violet },
  pink: { chip: "bg-pink-400", label: m.calendar_color_pink },
  gray: { chip: "bg-zinc-400", label: m.calendar_color_gray },
} as const

export type EventColor = keyof typeof COLORS

export const COLOR_KEYS: EventColor[] = [
  "",
  "info",
  "warning",
  "success",
  "error",
  "violet",
  "pink",
  "gray",
]

export const toColor = (value: string | null | undefined): EventColor =>
  COLOR_KEYS.find(color => color === value) ?? ""

const DEFAULT_LABELS: Record<string, () => string> = {
  todo: m.calendar_tag_todo,
  personal: m.calendar_tag_personal,
  work: m.calendar_tag_work,
}

export const tagLabel = (tag: EventTag) =>
  tag.name || DEFAULT_LABELS[tag.id]?.() || m.common_untitled()

export const tagsOf = (tags: EventTag[], event: CalendarEvent) =>
  tags.filter(tag => event.tags.includes(tag.id))

export const colorOf = (tags: EventTag[], event: CalendarEvent) =>
  COLORS[toColor(event.color || tagsOf(tags, event).find(t => t.color)?.color)]
    .chip

export const newTag = (tags: EventTag[], name: string): EventTag => ({
  id: crypto.randomUUID(),
  name,
  color: COLOR_KEYS[tags.length % COLOR_KEYS.length],
})

import { m } from "#lib/paraglide/messages.js"
import type { EventTag } from "./store.ts"
import type { CalendarEvent } from "./types.ts"

export const COLORS = {
  "": {
    chip: "bg-primary",
    ring: "border-primary",
    block: "bg-primary/15 hover:bg-primary/25",
    label: m.calendar_color_primary,
  },
  info: {
    chip: "bg-info",
    ring: "border-info",
    block: "bg-info/15 hover:bg-info/25",
    label: m.calendar_color_info,
  },
  warning: {
    chip: "bg-warning",
    ring: "border-warning",
    block: "bg-warning/20 hover:bg-warning/30",
    label: m.calendar_color_warning,
  },
  success: {
    chip: "bg-success",
    ring: "border-success",
    block: "bg-success/15 hover:bg-success/25",
    label: m.calendar_color_success,
  },
  error: {
    chip: "bg-error",
    ring: "border-error",
    block: "bg-error/15 hover:bg-error/25",
    label: m.calendar_color_error,
  },
  violet: {
    chip: "bg-violet-400",
    ring: "border-violet-400",
    block: "bg-violet-400/15 hover:bg-violet-400/25",
    label: m.calendar_color_violet,
  },
  pink: {
    chip: "bg-pink-400",
    ring: "border-pink-400",
    block: "bg-pink-400/15 hover:bg-pink-400/25",
    label: m.calendar_color_pink,
  },
  gray: {
    chip: "bg-zinc-400",
    ring: "border-zinc-400",
    block: "bg-zinc-400/15 hover:bg-zinc-400/25",
    label: m.calendar_color_gray,
  },
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

type Tagged = Pick<CalendarEvent, "color" | "tags">

export const tagsOf = (tags: EventTag[], event: Pick<CalendarEvent, "tags">) =>
  tags.filter(tag => event.tags.includes(tag.id))

export const colorKey = (tags: EventTag[], event: Tagged) =>
  toColor(event.color || tagsOf(tags, event).find(t => t.color)?.color)

export const colorOf = (tags: EventTag[], event: Tagged) =>
  COLORS[colorKey(tags, event)].chip

export const newTag = (tags: EventTag[], name: string): EventTag => ({
  id: crypto.randomUUID(),
  name,
  color: COLOR_KEYS[tags.length % COLOR_KEYS.length],
  hideWhileSharing: false,
})

export const hiddenWhileSharing = (tags: EventTag[]) => {
  const hidden = new Set(tags.filter(t => t.hideWhileSharing).map(t => t.id))

  return (event: CalendarEvent) => event.tags.some(id => hidden.has(id))
}

import type { CalendarEvent } from "@atrix/data"
import { tr } from "@atrix/i18n"
import type { EventTag } from "@atrix/settings"

const DEFAULT_TAGS = ["todo", "personal", "work"]

export const tagLabel = (tag: EventTag) =>
  tag.name ||
  tr(DEFAULT_TAGS.includes(tag.id) ? `panel.tags.${tag.id}` : "panel.untitled")

export const tagsOf = (tags: EventTag[], event: CalendarEvent) =>
  tags.filter(tag => (event.tags ?? []).includes(tag.id))

export const hiddenWhileSharing = (tags: EventTag[]) => {
  const hidden = new Set(tags.filter(t => t.hideWhileSharing).map(t => t.id))

  return (event: CalendarEvent) => (event.tags ?? []).some(id => hidden.has(id))
}

import type { Backend } from "#lib/datasource/client.ts"
import { allEvents, CALENDAR, toRow } from "./store.ts"
import type { CalendarEvent, SeriesChange } from "./types.ts"

export const getEvent = async (backend: Backend, id: string) => {
  const found = (await allEvents(backend)).find(event => event.id === id)

  return found ?? null
}

export const familyOf = async (backend: Backend, seriesId: string) =>
  (await allEvents(backend)).filter(
    event => event.id === seriesId || event.seriesId === seriesId,
  )

export const putEvent = async (backend: Backend, event: CalendarEvent) => {
  const { id, ...rest } = toRow(event)

  await backend.dsExecute(
    CALENDAR,
    `INSERT INTO events (id, title, "start", "end", all_day, note, color, created_by, recurrence, exdates, until, shift, series_id, original_date, tags, notes_sync, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
     ON CONFLICT(id) DO UPDATE SET title = ?2, "start" = ?3, "end" = ?4, all_day = ?5, note = ?6, color = ?7, created_by = ?8, recurrence = ?9, exdates = ?10, until = ?11, shift = ?12, series_id = ?13, original_date = ?14, tags = ?15, notes_sync = ?16, updated_at = ?17`,
    [
      id,
      rest.title,
      rest.start,
      rest.end,
      rest.allDay,
      rest.note,
      rest.color,
      rest.createdBy,
      rest.recurrence,
      rest.exdates,
      rest.until,
      rest.shift,
      rest.seriesId,
      rest.originalDate,
      rest.tags,
      rest.notesSync,
      rest.updatedAt,
    ],
  )
}

export const applyChange = async (backend: Backend, change: SeriesChange) => {
  for (const event of change.put) {
    await putEvent(backend, event)
  }

  if (change.remove.length > 0) {
    await backend.dsExecute(
      CALENDAR,
      `DELETE FROM events WHERE id IN (${change.remove.map(() => "?").join(", ")})`,
      change.remove,
    )
  }
}

export const deleteEvent = (backend: Backend, id: string) =>
  applyChange(backend, { put: [], remove: [id] })

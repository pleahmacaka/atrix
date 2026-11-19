import type { Backend } from "#lib/datasource/client.ts"
import {
  applyChange,
  deleteEvent,
  familyOf,
  getEvent,
  putEvent,
} from "./records.ts"
import { editInSeries, removeFromSeries, shareNotes } from "./series.ts"
import type { CalendarEvent, Occurrence, Scope } from "./types.ts"

const seriesOf = async (backend: Backend, occurrence: Occurrence) =>
  occurrence.seriesDate ? await getEvent(backend, occurrence.id) : null

export const notesOnly = (occurrence: Occurrence, draft: CalendarEvent) => {
  const keys = [
    "title",
    "start",
    "end",
    "allDay",
    "color",
    "recurrence",
    "until",
    "shift",
  ] as const

  return (
    keys.every(k => occurrence[k] === draft[k]) &&
    occurrence.tags.join() === draft.tags.join() &&
    occurrence.notes !== draft.notes
  )
}

export const saveOccurrence = async (
  backend: Backend,
  occurrence: Occurrence | null,
  draft: CalendarEvent,
  scope: Scope | null,
) => {
  const stamp = Date.now()
  const series = occurrence && (await seriesOf(backend, occurrence))

  if (!occurrence || !series) {
    await putEvent(backend, { ...draft, updatedAt: stamp })

    return
  }

  const family = await familyOf(backend, series.id)

  await applyChange(
    backend,
    series.notesSync && notesOnly(occurrence, draft)
      ? shareNotes(series, draft.notes, family, stamp)
      : editInSeries(series, occurrence, draft, scope ?? "one", family, stamp),
  )
}

export const removeOccurrence = async (
  backend: Backend,
  occurrence: Occurrence,
  scope: Scope | null,
) => {
  const series = await seriesOf(backend, occurrence)

  if (!series || !occurrence.seriesDate) {
    await deleteEvent(backend, occurrence.id)

    return
  }

  await applyChange(
    backend,
    removeFromSeries(
      series,
      occurrence.seriesDate,
      scope ?? "one",
      await familyOf(backend, series.id),
      Date.now(),
    ),
  )
}

export const setNotesSync = async (
  backend: Backend,
  occurrence: Occurrence,
  on: boolean,
) => {
  const series = await seriesOf(backend, occurrence)

  if (series) {
    await putEvent(backend, { ...series, notesSync: on, updatedAt: Date.now() })
  }
}

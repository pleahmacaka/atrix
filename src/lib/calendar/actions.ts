import type { Backend } from "#lib/datasource/client.ts"
import { isDone, occurrenceKey, withDone } from "./occurrence.ts"
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
    "reminder",
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
    const saved = { ...draft, updatedAt: stamp }

    await putEvent(backend, saved)

    return saved
  }

  const family = await familyOf(backend, series.id)

  if (series.notesSync && notesOnly(occurrence, draft)) {
    await applyChange(backend, shareNotes(series, draft.notes, family, stamp))

    return null
  }

  const change = editInSeries(
    series,
    occurrence,
    draft,
    scope ?? "one",
    family,
    stamp,
  )

  await applyChange(backend, change)

  return change.edited
}

export const toggleDone = async (backend: Backend, occurrence: Occurrence) => {
  const stored = await getEvent(backend, occurrence.id)

  if (stored) {
    await putEvent(
      backend,
      withDone(
        stored,
        occurrenceKey(occurrence),
        !isDone(occurrence),
        Date.now(),
      ),
    )
  }
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

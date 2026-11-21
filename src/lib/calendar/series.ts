import type { Backend } from "#lib/datasource/client.ts"
import { applyChange, familyOf, getEvent, putEvent } from "./events.ts"
import {
  type CalendarEvent,
  editInSeries,
  type Occurrence,
  removeFromSeries,
  type Scope,
  shareNotes,
} from "./recurrence.ts"

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

  if (series.notesSync && notesOnly(occurrence, draft)) {
    await applyChange(backend, shareNotes(series, draft.notes, family, stamp))

    return
  }

  await applyChange(
    backend,
    editInSeries(series, occurrence, draft, scope ?? "one", family, stamp),
  )
}

export const removeOccurrence = async (
  backend: Backend,
  occurrence: Occurrence,
  scope: Scope | null,
) => {
  const series = await seriesOf(backend, occurrence)

  if (!series || !occurrence.seriesDate) {
    await applyChange(backend, { put: [], remove: [occurrence.id] })

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

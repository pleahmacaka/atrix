import type { Backend } from "#lib/datasource/client.ts"
import { allEvents, deleteEvents, putEvent } from "./store.ts"
import type { SeriesChange } from "./types.ts"

export { putEvent } from "./store.ts"

export const getEvent = async (backend: Backend, id: string) => {
  const found = (await allEvents(backend)).find(event => event.id === id)

  return found ?? null
}

export const familyOf = async (backend: Backend, seriesId: string) =>
  (await allEvents(backend)).filter(
    event => event.id === seriesId || event.seriesId === seriesId,
  )

export const applyChange = async (backend: Backend, change: SeriesChange) => {
  for (const event of change.put) {
    await putEvent(backend, event)
  }

  if (change.remove.length > 0) {
    await deleteEvents(backend, change.remove)
  }
}

export const deleteEvent = (backend: Backend, id: string) =>
  deleteEvents(backend, [id])

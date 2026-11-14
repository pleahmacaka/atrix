import { and, asc, eq, gte, lt } from "drizzle-orm"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { type Backend, datasource } from "#lib/datasource/client.ts"

export const CALENDAR = "calendar"

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
  allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
  note: text("note").notNull().default(""),
  color: text("color").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
})

export type CalendarEvent = typeof events.$inferSelect

export type EventInput = {
  title: string
  start: string
  end: string
  allDay?: boolean
  note?: string
  color?: string
}

const CREATE = `CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  "start" TEXT NOT NULL,
  "end" TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT ''
)`

const ready = new WeakMap<Backend, Promise<void>>()

const prepare = async (backend: Backend) => {
  if (!(await backend.dsList()).includes(CALENDAR)) {
    await backend.dsCreate(CALENDAR)
  }

  // sqlite-proxy's migrator reads drizzle-kit files from disk, which the webview cannot
  await backend.dsExecute(CALENDAR, CREATE, [])
}

const open = async (backend: Backend) => {
  let pending = ready.get(backend)

  if (!pending) {
    pending = prepare(backend)
    ready.set(backend, pending)
    pending.catch(() => ready.delete(backend))
  }

  await pending

  return datasource(backend, CALENDAR)
}

export const toIso = (value: string) => {
  const date = value.includes("T") ? value : `${value}T00:00`
  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid_date: ${value}`)
  }

  return parsed.toISOString()
}

const normalized = (input: EventInput) => {
  const title = input.title.trim()
  const start = toIso(input.start)
  const end = toIso(input.end)

  if (!title) {
    throw new Error("invalid_title: title is empty")
  }

  if (end < start) {
    throw new Error("invalid_range: end is before start")
  }

  return {
    title,
    start,
    end,
    allDay: input.allDay ?? false,
    note: input.note ?? "",
    color: input.color ?? "",
  }
}

export const listEvents = async (backend: Backend, from: Date, to: Date) => {
  const db = await open(backend)

  return db
    .select()
    .from(events)
    .where(
      and(
        lt(events.start, to.toISOString()),
        gte(events.end, from.toISOString()),
      ),
    )
    .orderBy(asc(events.start))
}

export const addEvent = async (
  backend: Backend,
  input: EventInput,
  createdBy: string,
) => {
  const db = await open(backend)
  const row = { id: crypto.randomUUID(), ...normalized(input), createdBy }

  await db.insert(events).values(row)

  return row
}

export const updateEvent = async (
  backend: Backend,
  id: string,
  input: EventInput,
) => {
  const db = await open(backend)

  await db.update(events).set(normalized(input)).where(eq(events.id, id))
}

export const deleteEvent = async (backend: Backend, id: string) => {
  const db = await open(backend)

  await db.delete(events).where(eq(events.id, id))
}

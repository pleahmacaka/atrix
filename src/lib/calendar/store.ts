import { and, asc, eq, gte, isNull, lt, ne, or } from "drizzle-orm"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { type Backend, datasource } from "#lib/datasource/client.ts"
import { addDays, DAY_MS, dateKey, dateTimeKey, parseLocal } from "./dates.ts"
import { expand } from "./occurrence.ts"
import { putEvent } from "./records.ts"
import {
  type CalendarEvent,
  type HolidayCheck,
  RECURRENCES,
  type Recurrence,
  SHIFT_LIMIT,
  SHIFTS,
  type Shift,
} from "./types.ts"

export const CALENDAR = "calendar"

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
  allDay: integer("all_day", { mode: "boolean" }).notNull(),
  note: text("note").notNull(),
  color: text("color").notNull(),
  createdBy: text("created_by").notNull(),
  recurrence: text("recurrence").notNull(),
  exdates: text("exdates", { mode: "json" }).$type<string[]>().notNull(),
  until: text("until"),
  shift: text("shift").notNull(),
  seriesId: text("series_id"),
  originalDate: text("original_date"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
  notesSync: integer("notes_sync", { mode: "boolean" }).notNull(),
  reminder: integer("reminder"),
  updatedAt: integer("updated_at").notNull(),
})

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
})

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  done: integer("done", { mode: "boolean" }).notNull(),
  due: text("due"),
  createdBy: text("created_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

type EventRow = typeof events.$inferSelect

export type EventTag = typeof tags.$inferSelect

export type Task = typeof tasks.$inferSelect

export type EventInput = {
  title: string
  start: string
  end: string
  allDay?: boolean
  note?: string
  color?: string
  recurrence?: Recurrence
  until?: string | null
  shift?: Shift | null
  tags?: string[]
  reminder?: number | null
}

const CREATE_EVENTS = `CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  "start" TEXT NOT NULL,
  "end" TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT ''
)`

const COLUMNS: [string, string][] = [
  ["recurrence", "TEXT NOT NULL DEFAULT 'none'"],
  ["exdates", "TEXT NOT NULL DEFAULT '[]'"],
  ["until", "TEXT"],
  ["shift", "TEXT NOT NULL DEFAULT ''"],
  ["series_id", "TEXT"],
  ["original_date", "TEXT"],
  ["tags", "TEXT NOT NULL DEFAULT '[]'"],
  ["notes_sync", "INTEGER NOT NULL DEFAULT 0"],
  ["updated_at", "INTEGER NOT NULL DEFAULT 0"],
  ["reminder", "INTEGER"],
]

const CREATE_TAGS = `CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT ''
)`

const CREATE_TASKS = `CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  due TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
)`

const DEFAULT_TAGS = [
  ["todo", "warning"],
  ["personal", "success"],
  ["work", "info"],
]

const ready = new WeakMap<Backend, Promise<void>>()

const tableNames = async (backend: Backend) => {
  const { rows } = await backend.dsQuery(
    CALENDAR,
    "SELECT name FROM sqlite_master WHERE type = 'table'",
    [],
  )

  return new Set(rows.map(r => String(r[0])))
}

const prepare = async (backend: Backend) => {
  if (!(await backend.dsList()).includes(CALENDAR)) {
    await backend.dsCreate(CALENDAR)
  }

  const existing = await tableNames(backend)

  await backend.dsExecute(CALENDAR, CREATE_EVENTS, [])

  const { rows } = await backend.dsQuery(
    CALENDAR,
    "SELECT name FROM pragma_table_info('events')",
    [],
  )
  const present = new Set(rows.map(r => String(r[0])))

  for (const [name, type] of COLUMNS) {
    if (!present.has(name)) {
      await backend.dsExecute(
        CALENDAR,
        `ALTER TABLE events ADD COLUMN ${name} ${type}`,
        [],
      )
    }
  }

  await backend.dsExecute(CALENDAR, CREATE_TAGS, [])

  if (!existing.has("tags")) {
    for (const [id, color] of DEFAULT_TAGS) {
      await backend.dsExecute(
        CALENDAR,
        "INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, '', ?)",
        [id, color],
      )
    }
  }

  await backend.dsExecute(CALENDAR, CREATE_TASKS, [])
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
  const parsed = value.includes("T")
    ? new Date(value)
    : parseLocal(value.slice(0, 10))

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid_date: ${value}`)
  }

  return parsed.toISOString()
}

const recurrenceOf = (value: string): Recurrence =>
  RECURRENCES.find(r => r === value) ?? "none"

const shiftOf = (value: string | null | undefined): Shift | null =>
  SHIFTS.find(s => s === value) ?? null

const fromRow = (row: EventRow): CalendarEvent => {
  const start = new Date(row.start)
  const end = new Date(row.end)
  const lastDay = new Date(end.getTime() - DAY_MS)

  return {
    id: row.id,
    title: row.title,
    notes: row.note,
    start: row.allDay ? dateKey(start) : dateTimeKey(start),
    end: row.allDay ? dateKey(lastDay) : dateTimeKey(end),
    allDay: row.allDay,
    color: row.color,
    recurrence: recurrenceOf(row.recurrence),
    tags: row.tags ?? [],
    exdates: row.exdates ?? [],
    until: row.until,
    shift: shiftOf(row.shift),
    seriesId: row.seriesId,
    originalDate: row.originalDate,
    notesSync: row.notesSync,
    reminder: row.reminder,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
  }
}

export const toRow = (event: CalendarEvent): EventRow => ({
  id: event.id,
  title: event.title,
  note: event.notes,
  start: parseLocal(event.start).toISOString(),
  end: (event.allDay
    ? addDays(parseLocal(event.end), 1)
    : parseLocal(event.end)
  ).toISOString(),
  allDay: event.allDay,
  color: event.color,
  createdBy: event.createdBy,
  recurrence: event.recurrence,
  exdates: event.exdates,
  until: event.until,
  shift: event.shift ?? "",
  seriesId: event.seriesId,
  originalDate: event.originalDate,
  tags: event.tags,
  notesSync: event.notesSync,
  reminder: event.reminder,
  updatedAt: event.updatedAt,
})

export const fromInput = (
  input: EventInput,
  createdBy: string,
  id: string = crypto.randomUUID(),
): CalendarEvent => {
  const title = input.title.trim()
  const start = toIso(input.start)
  const end = toIso(input.end)

  if (!title) {
    throw new Error("invalid_title: title is empty")
  }

  if (end < start) {
    throw new Error("invalid_range: end is before start")
  }

  return fromRow({
    id,
    title,
    start,
    end,
    allDay: input.allDay ?? false,
    note: input.note ?? "",
    color: input.color ?? "",
    createdBy,
    recurrence: input.recurrence ?? "none",
    exdates: [],
    until: input.until ?? null,
    shift: input.shift ?? "",
    seriesId: null,
    originalDate: null,
    tags: input.tags ?? [],
    notesSync: false,
    reminder: input.reminder ?? null,
    updatedAt: Date.now(),
  })
}

const LOOKBACK_DAYS = SHIFT_LIMIT + 1

export const listEvents = async (
  backend: Backend,
  from: Date,
  to: Date,
  isHoliday?: HolidayCheck,
) => {
  const db = await open(backend)
  const reach = addDays(to, LOOKBACK_DAYS).toISOString()
  const rows = await db
    .select()
    .from(events)
    .where(
      or(
        and(
          eq(events.recurrence, "none"),
          lt(events.start, to.toISOString()),
          gte(events.end, from.toISOString()),
        ),
        and(
          ne(events.recurrence, "none"),
          lt(events.start, reach),
          or(
            isNull(events.until),
            gte(events.until, dateKey(addDays(from, -LOOKBACK_DAYS))),
          ),
        ),
      ),
    )
    .orderBy(asc(events.start))

  return expand(rows.map(fromRow), from, to, isHoliday)
}

export const allEvents = async (backend: Backend) => {
  const db = await open(backend)

  return (await db.select().from(events)).map(fromRow)
}

export const addEvent = async (
  backend: Backend,
  input: EventInput,
  createdBy: string,
) => {
  const event = fromInput(input, createdBy)

  await putEvent(backend, event)

  return event
}

export const listTags = async (backend: Backend) => {
  const db = await open(backend)

  return db.select().from(tags).orderBy(asc(tags.id))
}

export const putTag = async (backend: Backend, tag: EventTag) => {
  const db = await open(backend)
  const { id, ...rest } = tag

  await db
    .insert(tags)
    .values(tag)
    .onConflictDoUpdate({ target: tags.id, set: rest })

  return id
}

export const deleteTag = async (backend: Backend, id: string) => {
  const db = await open(backend)

  await db.delete(tags).where(eq(tags.id, id))
}

export const listTasks = async (backend: Backend) => {
  const db = await open(backend)

  return db.select().from(tasks)
}

export const putTask = async (backend: Backend, task: Task) => {
  const db = await open(backend)
  const { id, ...rest } = task

  await db
    .insert(tasks)
    .values(task)
    .onConflictDoUpdate({ target: tasks.id, set: rest })
}

export const deleteTask = async (backend: Backend, id: string) => {
  const db = await open(backend)

  await db.delete(tasks).where(eq(tasks.id, id))
}

export const newTask = (title: string, due: string | null): Task => ({
  id: crypto.randomUUID(),
  title,
  done: false,
  due,
  createdBy: "",
  updatedAt: Date.now(),
})

import {
  removeOccurrence,
  saveOccurrence,
  setNotesSync,
  toggleDone,
} from "#lib/calendar/actions.ts"
import { holidays, prefs } from "#lib/calendar/calendar.svelte.ts"
import {
  dateKey,
  dayDelta,
  parseLocal,
  startOfDay,
} from "#lib/calendar/dates.ts"
import { format } from "#lib/calendar/format.ts"
import { inSeries } from "#lib/calendar/occurrence.ts"
import { deleteEvent, getEvent, putEvent } from "#lib/calendar/records.ts"
import {
  type SharedEvent,
  type SharedRecord,
  sharedRecords,
  watchRecords,
} from "#lib/calendar/shared.svelte.ts"
import { deleteTag, type EventTag, putTag } from "#lib/calendar/store.ts"
import {
  COLORS,
  colorKey,
  hiddenWhileSharing,
  newTag,
} from "#lib/calendar/tags.ts"
import type { CalendarEvent, Occurrence, Scope } from "#lib/calendar/types.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { Draft } from "./draft.ts"
import {
  childrenOf,
  type DragRange,
  daySections,
  eventsByDay,
  eventsOn,
  monthGrid,
  openOccurrence,
  orderedDay,
  rangeTone,
  reorderRecords,
  selectedRange,
} from "./projections.ts"

export type View =
  | { kind: "day" }
  | { kind: "event"; id: string; date: string | null }
  | { kind: "new"; day: Date; span: number; parent: string | null }

export type ScopeMode = "edit" | "delete"

type Asking = {
  mode: ScopeMode
  scoped: boolean
  answer: (scope: Scope | null) => void
}

const GRID_DAYS = 42

export const DEFAULT_REMINDER = 10

export class Panel {
  attempt = new Attempt()

  records = $state.raw<SharedRecord[]>([])

  tags = $state.raw<EventTag[]>([])

  sharing = $state(false)

  knowledge = $state(false)

  now = $state(new Date())

  cursor = $state(startOfDay(new Date()))

  selected = $state(startOfDay(new Date()))

  view = $state<View>({ kind: "day" })

  rangeEnd = $state<Date | null>(null)

  drag = $state<DragRange | null>(null)

  asking = $state<Asking | null>(null)

  revealedDays = $state<string[]>([])

  kept: { key: string; draft: Draft } | null = null

  readonly hosts: () => HostView[]

  readonly openDoc: (id: string) => void

  #creating = false

  constructor(hosts: () => HostView[], openDoc: (id: string) => void) {
    this.hosts = hosts
    this.openDoc = openDoc

    $effect(() => {
      void holidays.load()
    })

    watchRecords(this.hosts, this.attempt.run, (records, tags) => {
      this.records = records
      this.tags = tags
    })
  }

  get ready() {
    return this.hosts().length > 0
  }

  today = $derived(startOfDay(this.now))

  weeks = $derived(
    monthGrid(
      this.cursor.getFullYear(),
      this.cursor.getMonth(),
      prefs.weekStartsOn,
    ),
  )

  month = $derived(this.cursor.getMonth())

  monthLabel = $derived(format(this.cursor, { year: "numeric", month: "long" }))

  #concealed = $derived.by(() => {
    if (!this.sharing) {
      return []
    }

    return this.records.filter(hiddenWhileSharing(this.tags))
  })

  shown = $derived(
    this.#concealed.length === 0
      ? this.records
      : this.records.filter(e => !this.#concealed.includes(e)),
  )

  hiddenOn = (day: Date) =>
    this.#concealed.length === 0
      ? []
      : eventsOn(this.#concealed, day, holidays.isHoliday)

  isRevealed = (day: Date) => this.revealedDays.includes(dateKey(day))

  toggleReveal = (day: Date) => {
    const key = dateKey(day)

    this.revealedDays = this.revealedDays.includes(key)
      ? this.revealedDays.filter(entry => entry !== key)
      : [...this.revealedDays, key]
  }

  byDay = $derived(
    eventsByDay(this.shown, this.weeks[0][0], GRID_DAYS, holidays.isHoliday),
  )

  orderedDay = (day: Date) => orderedDay(this.shown, day, holidays.isHoliday)

  dayEvents = $derived(this.orderedDay(this.selected))

  range = $derived(selectedRange(this.selected, this.rangeEnd, this.drag))

  daySections = $derived(
    daySections(this.selected, this.rangeEnd, this.orderedDay),
  )

  inRange = (day: Date) =>
    this.range !== null && day >= this.range[0] && day <= this.range[1]

  rangeTone = (day: Date) => rangeTone(day, this.range, prefs.weekStartsOn)

  beginDrag = (day: Date) => {
    this.drag = { from: day, to: day }
  }

  extendDrag = (day: Date) => {
    if (this.drag) {
      this.drag = { ...this.drag, to: day }
    }
  }

  endDrag = () => {
    const range = this.drag && this.range

    this.drag = null

    if (range && dateKey(range[0]) !== dateKey(range[1])) {
      this.startRange(range[0], range[1])
    }
  }

  openEvent = $derived(
    this.view.kind === "event"
      ? openOccurrence(
          this.records,
          this.view.id,
          this.view.date,
          holidays.isHoliday,
        )
      : null,
  )

  detailOpen = $derived(this.view.kind === "new" || this.openEvent !== null)

  eventsOn = (day: Date) => this.byDay.get(dateKey(day)) ?? []

  parentOf = (event: CalendarEvent) =>
    event.parentId ? this.shown.find(e => e.id === event.parentId) : undefined

  childrenOf = (event: CalendarEvent) => childrenOf(this.shown, event)

  hasChildren = (event: CalendarEvent) =>
    this.records.some(e => e.parentId === event.id)

  isRoot = (event: CalendarEvent) =>
    !event.parentId || !this.records.some(e => e.id === event.parentId)

  groupOf = (event: CalendarEvent) =>
    event.group ? this.shown.filter(e => e.group === event.group) : []

  colorOf = (event: Pick<CalendarEvent, "color" | "tags">) =>
    COLORS[colorKey(this.tags, event)]

  dotTone = (event: CalendarEvent) => {
    const color = this.colorOf(event)

    return inSeries(event) ? ["border", color.ring] : color.chip
  }

  go = (view: View) => {
    this.asking?.answer(null)
    this.kept = null
    this.view = view
  }

  close = () => this.go({ kind: "day" })

  shift = (months: number) => {
    this.cursor = new Date(
      this.cursor.getFullYear(),
      this.cursor.getMonth() + months,
      1,
    )
  }

  jumpToday = () => {
    this.cursor = startOfDay(this.now)
    this.selected = startOfDay(this.now)
    this.rangeEnd = null
    this.close()
  }

  reset = () => {
    this.now = new Date()
    this.jumpToday()
  }

  pick = (day: Date) => {
    this.selected = day
    this.rangeEnd = null
    this.close()

    if (day.getMonth() !== this.cursor.getMonth()) {
      this.cursor = new Date(day.getFullYear(), day.getMonth(), 1)
    }
  }

  show = (event: Occurrence) =>
    this.go({
      kind: "event",
      id: event.id,
      date:
        event.seriesDate ??
        (event.recurrence === "none" ? null : event.start.slice(0, 10)),
    })

  #reveal = (event: CalendarEvent) =>
    this.go({
      kind: "event",
      id: event.id,
      date: event.recurrence === "none" ? null : event.start.slice(0, 10),
    })

  startNew = () =>
    this.go({
      kind: "new",
      day: this.selected,
      span: this.rangeEnd
        ? dayDelta(dateKey(this.selected), dateKey(this.rangeEnd))
        : 0,
      parent: null,
    })

  startChild = (parent: CalendarEvent) => {
    this.selected = startOfDay(parseLocal(parent.start))
    this.rangeEnd = null
    this.go({ kind: "new", day: this.selected, span: 0, parent: parent.id })
  }

  startRange = (start: Date, end: Date) => {
    this.selected = start
    this.rangeEnd = end
    this.go({
      kind: "new",
      day: start,
      span: dayDelta(dateKey(start), dateKey(end)),
      parent: null,
    })
  }

  askScope = (mode: ScopeMode, scoped = true) =>
    new Promise<Scope | null>(resolve => {
      this.asking?.answer(null)
      this.asking = {
        mode,
        scoped,
        answer: scope => {
          this.asking = null
          resolve(scope)
        },
      }
    })

  #home = () => this.hosts()[0]

  #refresh = async () => {
    this.records = await sharedRecords(this.hosts())
  }

  #hostOf = (id: string) =>
    this.records.find(e => e.id === id)?.host ?? this.#home()

  stored = (id: string) => {
    const host = this.#hostOf(id)

    return host ? getEvent(host, id) : Promise.resolve(null)
  }

  createEvent = async (next: CalendarEvent) => {
    const host = next.parentId ? this.#hostOf(next.parentId) : this.#home()

    if (this.#creating || !host) {
      return
    }

    this.#creating = true

    try {
      const created = await this.attempt.run(async () => {
        await putEvent(host, next)
        await this.#refresh()
      })

      if (created) {
        this.#reveal(next)
      }
    } finally {
      this.#creating = false
    }
  }

  commitEvent = async (
    occurrence: SharedEvent,
    next: CalendarEvent,
    scope: Scope | null,
  ) => {
    if (!occurrence.seriesDate || !scope) {
      await this.attempt.run(() => putEvent(occurrence.host, next))

      return
    }

    await this.attempt.run(async () => {
      const edited = await saveOccurrence(
        occurrence.host,
        occurrence,
        next,
        scope,
      )

      if (edited) {
        await this.#refresh()
        this.#reveal({ ...edited, start: next.start })
      }
    })
  }

  shareNotes = (occurrence: SharedEvent, notes: string) =>
    this.attempt.run(() =>
      saveOccurrence(
        occurrence.host,
        occurrence,
        { ...occurrence, notes },
        null,
      ),
    )

  notesSync = (occurrence: SharedEvent, on: boolean) =>
    this.attempt.run(() => setNotesSync(occurrence.host, occurrence, on))

  #putStored = async (event: SharedEvent, change: Partial<CalendarEvent>) => {
    const stored = await getEvent(event.host, event.id)

    if (stored) {
      await putEvent(event.host, {
        ...stored,
        ...change,
        updatedAt: Date.now(),
      })
    }
  }

  groupWith = (moved: SharedEvent, target: SharedEvent) =>
    this.attempt.run(async () => {
      const group = target.group ?? moved.group ?? crypto.randomUUID()

      await Promise.all([
        this.#putStored(moved, { group }),
        this.#putStored(target, { group }),
      ])
    })

  ungroup = (event: SharedEvent) =>
    this.attempt.run(() => this.#putStored(event, { group: null }))

  reorderDay = (fromId: string, toId: string, after: boolean) =>
    this.attempt.run(async () => {
      const next = reorderRecords(
        this.dayEvents,
        this.shown,
        fromId,
        toId,
        after,
      )

      await Promise.all(
        next.map(({ host, ...base }) =>
          putEvent(host, { ...base, updatedAt: Date.now() }),
        ),
      )
    })

  remove = async (event: SharedEvent) => {
    const scope = await this.askScope("delete", event.seriesDate !== undefined)

    if (!scope) {
      return
    }

    await this.attempt.run(() =>
      event.seriesDate
        ? removeOccurrence(event.host, event, scope)
        : deleteEvent(event.host, event.id),
    )
    this.close()
  }

  toggleDone = (event: SharedEvent) =>
    this.attempt.run(() => toggleDone(event.host, event))

  createTag = async (name: string) => {
    const host = this.openEvent?.host ?? this.#home()
    const tag = newTag(this.tags, name)

    if (!host) {
      return null
    }

    const created = await this.attempt.run(async () => {
      await putTag(host, tag)
      this.tags = [...this.tags, tag]
    })

    return created ? tag.id : null
  }

  updateTag = (tag: EventTag) =>
    this.attempt.run(async () => {
      await Promise.all(this.hosts().map(h => putTag(h, tag)))
      this.tags = this.tags.map(t => (t.id === tag.id ? tag : t))
    })

  removeTag = (tag: EventTag) =>
    this.attempt.run(async () => {
      await Promise.all(this.hosts().map(h => deleteTag(h, tag.id)))
      this.tags = this.tags.filter(t => t.id !== tag.id)
    })
}

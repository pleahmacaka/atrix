import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"
import {
  notesOnly,
  removeOccurrence,
  saveOccurrence,
  setNotesSync,
  toggleDone,
} from "./actions.ts"
import { calendar, holidays, pick, WEEKS } from "./calendar.svelte.ts"
import { addDays } from "./dates.ts"
import { allDayDraft } from "./draft.ts"
import { onDay } from "./occurrence.ts"
import { type SharedEvent, watchShared } from "./shared.svelte.ts"
import { deleteTag, type EventTag, putTag } from "./store.ts"
import { newTag } from "./tags.ts"
import type { CalendarEvent, Scope } from "./types.ts"

type Asking = {
  mode: "edit" | "delete"
  answer: (scope: Scope | null) => void
}

export class CalendarEditor {
  attempt = new Attempt()

  events = $state<SharedEvent[]>([])

  tags = $state<EventTag[]>([])

  editing = $state<SharedEvent | "new" | null>(null)

  asking = $state<Asking | null>(null)

  selected = $derived(this.events.filter(e => onDay(e, calendar.selected)))

  readonly hosts: () => HostView[]

  readonly openDoc: (id: string) => void

  constructor(hosts: () => HostView[], openDoc: (id: string) => void) {
    this.hosts = hosts
    this.openDoc = openDoc

    $effect(() => {
      void holidays.load()
    })

    watchShared(
      () => ({
        hosts: this.hosts(),
        from: calendar.start,
        to: addDays(calendar.start, WEEKS * 7),
        isHoliday: holidays.isHoliday,
      }),
      this.attempt.run,
      (found, known) => {
        this.events = found
        this.tags = known
      },
    )
  }

  get ready() {
    return this.hosts().length > 0
  }

  choose = (day: Date) => {
    this.editing = null
    pick(day)
  }

  #home = () => this.hosts()[0]

  #target = () =>
    this.editing && this.editing !== "new" ? this.editing.host : this.#home()

  #askScope = (mode: Asking["mode"]) =>
    new Promise<Scope | null>(resolve => {
      this.asking = {
        mode,
        answer: scope => {
          this.asking = null
          resolve(scope)
        },
      }
    })

  save = async (draft: CalendarEvent) => {
    const current = this.editing === "new" ? null : this.editing
    const scoped =
      current?.seriesDate !== undefined &&
      !(current.notesSync && notesOnly(current, draft))
    const scope = scoped ? await this.#askScope("edit") : null

    if (scope || !current?.seriesDate) {
      await this.attempt.run(async () => {
        await saveOccurrence(this.#target(), current, draft, scope)

        this.editing = null
      })
    }
  }

  quickAdd = (title: string) =>
    this.attempt.run(() =>
      saveOccurrence(
        this.#home(),
        null,
        allDayDraft(calendar.selected, title),
        null,
      ),
    )

  remove = async (event: SharedEvent) => {
    const direct = event.seriesDate === undefined
    const scope = direct ? null : await this.#askScope("delete")

    if (direct || scope) {
      await this.attempt.run(async () => {
        await removeOccurrence(event.host, event, scope)

        this.editing = null
      })
    }
  }

  menu = (e: MouseEvent, event: SharedEvent) =>
    contextMenu.show(e, [
      {
        label: m.calendar_edit(),
        icon: "lucide:pencil",
        run: () => (this.editing = event),
      },
      "separator",
      {
        label: m.common_delete(),
        icon: "lucide:trash-2",
        danger: true,
        confirm: event.seriesDate ? undefined : m.common_confirm_delete(),
        run: () => this.remove(event),
      },
    ])

  notesSync = (event: SharedEvent, on: boolean) =>
    this.attempt.run(() => setNotesSync(event.host, event, on))

  createTag = async (name: string) => {
    const tag = newTag(this.tags, name)
    const created = await this.attempt.run(async () => {
      await putTag(this.#target(), tag)
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

  toggleDone = (event: SharedEvent) =>
    this.attempt.run(() => toggleDone(event.host, event))
}

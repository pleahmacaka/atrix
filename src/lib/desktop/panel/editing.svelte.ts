import { untrack } from "svelte"
import type { Scope } from "#lib/calendar/types.ts"
import {
  type Draft,
  draftFrom,
  eventFrom,
  isValid,
  type Seed,
} from "./draft.ts"
import { DEFAULT_REMINDER, type Panel } from "./panel.svelte.ts"

export type Field = "date" | "repeat" | "reminder" | "tags" | "task" | "add"

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b)

export const editingState = (panel: Panel) => {
  const event = $derived(panel.openEvent)
  const view = $derived(panel.view)
  const seed = $derived<Seed>(
    view.kind === "new" ? view : { day: panel.selected, span: 0, parent: null },
  )
  const keepKey = untrack(() =>
    view.kind === "event" ? `${view.id}@${view.date}` : "new",
  )
  const baseline = () => draftFrom(event, seed, DEFAULT_REMINDER)
  const kept = untrack(() => panel.kept)

  let draft = $state<Draft>(
    kept?.key === keepKey ? kept.draft : untrack(baseline),
  )
  let seenStamp = untrack(() => event?.updatedAt)
  let open = $state<Field | null>(null)
  let writingNotes = $state(false)
  let scope: Scope | null = null

  $effect(() => {
    const current = event

    if (current?.updatedAt === seenStamp) {
      return
    }

    seenStamp = current?.updatedAt

    untrack(() => {
      if (
        current &&
        open === null &&
        !writingNotes &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        draft = baseline()
      }
    })
  })

  $effect(() => {
    panel.kept = { key: keepKey, draft: $state.snapshot(draft) }
  })

  $effect(() => {
    if (panel.asking) {
      untrack(() => {
        open = null
      })
    }
  })

  const matches = (next: Draft) => event !== null && same(baseline(), next)

  const commit = async () => {
    const current = event

    if (!isValid(draft) || matches(draft)) {
      return
    }

    if (!current) {
      if (view.kind === "new") {
        await panel.createEvent(eventFrom(draft, null, Date.now()))
      }

      return
    }

    if (
      current.seriesDate &&
      current.notesSync &&
      matches({ ...draft, notes: current.notes })
    ) {
      await panel.shareNotes(current, draft.notes)

      return
    }

    if (current.seriesDate && !scope) {
      scope = await panel.askScope("edit")

      if (!scope) {
        draft = baseline()

        return
      }
    }

    const occurrence = event

    if (!occurrence) {
      return
    }

    const stored = await panel.stored(occurrence.id)
    const latest = event

    if (!latest) {
      return
    }

    await panel.commitEvent(latest, eventFrom(draft, stored, Date.now()), scope)
  }

  const change = (next: Partial<Draft>) => {
    draft = { ...draft, ...next }
    void commit()
  }

  return {
    get draft() {
      return draft
    },
    get open() {
      return open
    },
    set open(next: Field | null) {
      open = next
    },
    get writingNotes() {
      return writingNotes
    },
    set writingNotes(next: boolean) {
      writingNotes = next
    },
    commit,
    change,
    toggle: (field: Field) => {
      open = open === field ? null : field
    },
    addField: (field: Field) => {
      if (field === "task") {
        change({ task: true })
        open = null

        return
      }

      if (field === "reminder") {
        change({ reminder: DEFAULT_REMINDER })
      }

      open = field
    },
  }
}

export type EditingState = ReturnType<typeof editingState>

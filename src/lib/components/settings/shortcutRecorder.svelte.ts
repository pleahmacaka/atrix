import {
  assignable,
  chordOf,
  conflictOf,
  rebind,
  type ShortcutId,
} from "#lib/store/shortcuts.ts"

export class ShortcutRecorder {
  id = $state<ShortcutId | null>(null)

  conflict = $state<{ id: ShortcutId; name: string } | null>(null)

  start = (id: ShortcutId) => {
    this.conflict = null
    this.id = id
  }

  stop = () => {
    this.id = null
  }

  capture = () => {
    const record = (e: KeyboardEvent) => this.#record(e)

    window.addEventListener("keydown", record, { capture: true })

    return () =>
      window.removeEventListener("keydown", record, { capture: true })
  }

  #record = (e: KeyboardEvent) => {
    const id = this.id

    if (!id) {
      return
    }

    e.preventDefault()
    e.stopImmediatePropagation()

    if (e.key === "Escape") {
      this.stop()

      return
    }

    const chord = chordOf(e)

    if (!chord || !assignable(chord)) {
      return
    }

    const taken = conflictOf(id, chord)

    if (taken) {
      this.conflict = { id, name: taken.label }
    } else {
      rebind(id, chord)
      this.conflict = null
    }

    this.stop()
  }
}

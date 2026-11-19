<script lang="ts">
import { on } from "svelte/events"
import { cite } from "#lib/calendar/citations.ts"
import type { SharedEvent } from "#lib/calendar/shared.svelte.ts"
import DocPicker from "#lib/components/calendar/DocPicker.svelte"
import Markdown from "#lib/components/chat/Markdown.svelte"
import { openUrl } from "#lib/desktop/native/system.ts"
import type { Entry } from "#lib/knowledge/store.ts"
import { logFailure } from "#lib/logging.ts"
import { m } from "#lib/paraglide/messages.js"
import type { EditingState } from "./editing.svelte.ts"
import type { Panel } from "./panel.svelte.ts"

let {
  panel,
  event,
  editor,
}: { panel: Panel; event: SharedEvent | null; editor: EditingState } = $props()

const draft = $derived(editor.draft)

let field = $state<HTMLTextAreaElement>()

let dirty = false

const finish = () => {
  editor.writingNotes = false

  if (dirty) {
    dirty = false
    void editor.commit()
  }
}

const writing = (node: HTMLTextAreaElement) => {
  node.focus()
  node.setSelectionRange(node.value.length, node.value.length)

  return () => {
    if (dirty) {
      dirty = false
      void editor.commit()
    }
  }
}

const leave = (e: FocusEvent & { currentTarget: HTMLElement }) => {
  const next = e.relatedTarget

  if (!(next instanceof Node && e.currentTarget.contains(next))) {
    finish()
  }
}

const insert = (entry: Entry) => {
  const at = field?.selectionEnd ?? draft.notes.length
  const before = draft.notes.slice(0, at)
  const gap = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : ""

  draft.notes = `${before}${gap}${cite(entry.meta.id, entry.meta.title)}${draft.notes.slice(at)}`
  dirty = true
  field?.focus()
}

const follow = (e: MouseEvent) => {
  const anchor = e.target instanceof Element ? e.target.closest("a") : null

  const doc = panel.knowledge ? anchor?.dataset.kg : undefined

  if (!anchor || (anchor.dataset.kg && !doc)) {
    editor.writingNotes = true

    return
  }

  e.preventDefault()

  if (doc) {
    panel.openDoc(doc)
  } else if (anchor.href) {
    openUrl(anchor.href).catch(err => logFailure("panel open link", err))
  }
}
</script>

<div class="mt-6 flex flex-col gap-1.5">
  <span class="text-xs font-medium text-base-content/60">{m.calendar_note()}</span>

  {#if event?.seriesDate}
    {@const occurrence = event}
    <label class="flex cursor-pointer items-center gap-1.5 text-xs text-base-content/45">
      {occurrence.notesSync ? m.panel_notes_sync_all() : m.panel_notes_sync_ask()}
      <span class="ms-auto text-base-content/60">{m.panel_notes_sync()}</span>
      <input
        type="checkbox"
        class="toggle toggle-primary toggle-xs"
        checked={occurrence.notesSync}
        onchange={e => panel.notesSync(occurrence, e.currentTarget.checked)}
      />
    </label>
  {/if}

  {#if editor.writingNotes}
    <div class="flex flex-col gap-1.5" onfocusout={leave} role="presentation">
      <textarea
        bind:this={field}
        class="textarea textarea-sm field-sizing-content min-h-20 w-full"
        placeholder={m.panel_notes_write()}
        aria-label={m.calendar_note()}
        value={draft.notes}
        oninput={e => {
          draft.notes = e.currentTarget.value
          dirty = true
        }}
        {@attach writing}
      ></textarea>
      {#if panel.knowledge}
        <div class="flex">
          <DocPicker onpick={insert} />
        </div>
      {/if}
    </div>
  {:else}
    <div class="group relative -mx-2 px-2 py-1">
      <button
        type="button"
        class={[
          "absolute inset-0 cursor-text rounded-field",
          "transition-colors duration-120 group-hover:bg-base-content/8",
        ]}
        aria-label={m.panel_notes_write()}
        onclick={() => (editor.writingNotes = true)}
      ></button>
      {#if draft.notes}
        <div
          class="relative cursor-text text-sm text-base-content/85"
          {@attach node => on(node, "click", follow)}
        >
          <Markdown text={draft.notes} />
        </div>
      {:else}
        <span class="pointer-events-none relative text-sm text-base-content/45">
          {m.panel_notes_write()}
        </span>
      {/if}
    </div>
  {/if}
</div>

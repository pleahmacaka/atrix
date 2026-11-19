<script lang="ts">
  import { t } from "svelte-i18n"
  import { type Occurrence, setNotesSync } from "#lib/desktop/data/index.js"
  import type { EditingState } from "./editing.svelte"
  import MemoEditor from "./MemoEditor.svelte"
  import NoteText from "./NoteText.svelte"

  const { event, editor }: {
    event: Occurrence | null
    editor: EditingState
  } = $props()
  const draft = $derived(editor.draft)
</script>

<div class="mt-5 flex flex-col gap-1.5 border-t border-base-300 pt-4">
  <span class="text-2xs font-medium text-base-content/60">
    {$t("panel.event.notes")}
  </span>

  {#if event?.seriesDate}
    {@const occurrence = event}
    <label class="flex cursor-pointer items-center gap-1.5 text-2xs text-base-content/45">
      {$t(occurrence.notesSync ? "panel.event.notesSync.all" : "panel.event.notesSync.ask")}
      <span class="ml-auto text-base-content/60">{$t("panel.event.notesSync.label")}</span>
      <input
        type="checkbox"
        class="toggle toggle-primary toggle-xs"
        checked={occurrence.notesSync ?? false}
        onchange={e => setNotesSync(occurrence, e.currentTarget.checked)}
      />
    </label>
  {/if}

  {#if editor.writingNotes}
    <MemoEditor
      text={draft.notes}
      onchange={notes => (draft.notes = notes)}
      onblur={() => {
        editor.writingNotes = false
        editor.commit()
      }}
    />
  {:else if draft.notes}
    <div
      class="-mx-2 cursor-text rounded-field px-2 py-1 text-left transition-colors duration-120 hover:bg-base-content/6"
    >
      <NoteText text={draft.notes} onedit={() => (editor.writingNotes = true)} />

      <button
        type="button"
        class="sr-only focus-visible:not-sr-only focus-visible:text-xs"
        onclick={() => (editor.writingNotes = true)}
      >
        {$t("panel.event.writeNotes")}
      </button>
    </div>
  {:else}
    <button
      type="button"
      class="-mx-2 cursor-text rounded-field px-2 py-1 text-left transition-colors duration-120 hover:bg-base-content/6"
      onclick={() => (editor.writingNotes = true)}
    >
      <span class="text-sm text-base-content/45">{$t("panel.event.writeNotes")}</span>
    </button>
  {/if}
</div>

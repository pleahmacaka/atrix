<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { isDone } from "#lib/calendar/occurrence.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { m } from "#lib/paraglide/messages.js"
import { finalTitle } from "./draft.ts"
import EventFields from "./EventFields.svelte"
import EventNotes from "./EventNotes.svelte"
import { editingState } from "./editing.svelte.ts"
import type { Panel } from "./panel.svelte.ts"
import RelationField from "./RelationField.svelte"

let { panel }: { panel: Panel } = $props()

const editor = editingState(untrack(() => panel))

const draft = $derived(editor.draft)

const event = $derived(panel.openEvent)

const chip = $derived(
  panel.colorOf({ color: event?.color ?? "", tags: draft.tags }).chip,
)

const done = $derived(event ? isDone(event) : false)

const locked = $derived(event !== null && panel.hasChildren(event))
</script>

<div class="flex h-full min-h-0 flex-col select-text">
  <header class="flex min-h-12 items-center gap-2 px-2 pt-2">
    <button
      type="button"
      class="btn btn-ghost btn-square btn-xs"
      aria-label={m.common_back()}
      title={m.common_back()}
      onclick={panel.close}
    >
      <Icon icon="lucide:arrow-left" class="size-3.5" />
    </button>
    <span class="flex-1"></span>
    {#if event}
      <button
        type="button"
        class="btn btn-ghost btn-square btn-xs text-error"
        aria-label={m.common_delete()}
        title={m.common_delete()}
        onclick={() => panel.remove(event)}
      >
        <Icon icon="lucide:trash-2" class="size-3.5" />
      </button>
    {/if}
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-4">
    <div class="flex items-start gap-2.5">
      {#if draft.task && event}
        <input
          type="checkbox"
          class="checkbox checkbox-primary checkbox-sm mt-1.5 shrink-0"
          checked={done}
          aria-label={done ? m.panel_task_undo() : m.panel_task_done()}
          onchange={() => panel.toggleDone(event)}
        />
      {:else}
        <span class={["mt-2.5 size-2.5 shrink-0 rounded-full", chip]}></span>
      {/if}
      <input
        class={[
          "min-w-0 flex-1 border-0 bg-transparent p-0 text-xl leading-tight font-semibold outline-none",
          "placeholder:text-base-content/35",
          done && "text-base-content/50 line-through",
        ]}
        placeholder={m.panel_event_new()}
        aria-label={m.calendar_field_title()}
        value={draft.title}
        {@attach node => {
          if (!event) {
            node.focus()
          }
        }}
        oninput={e => (draft.title = e.currentTarget.value)}
        onblur={() => {
          if (finalTitle(draft)) {
            void editor.commit()
          }
        }}
        onkeydown={e => {
          if (e.key === "Enter") {
            e.currentTarget.blur()
          }
        }}
      />
    </div>

    <EventFields {panel} {editor} />

    <RelationField
      {panel}
      {event}
      parent={draft.parent}
      {locked}
      onparent={id => editor.change({ parent: id })}
    />

    <EventNotes {panel} {event} {editor} />

    <ErrorAlert message={panel.attempt.failure} />
  </div>
</div>

<script lang="ts">
import type { ClassValue } from "svelte/elements"
import { calendar } from "#lib/calendar/calendar.svelte.ts"
import type { CalendarEditor } from "#lib/calendar/editor.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import DayHeading from "./DayHeading.svelte"
import DayPanel from "./DayPanel.svelte"
import EventForm from "./EventForm.svelte"
import ScopeDialog from "./ScopeDialog.svelte"

let { editor, class: extra }: { editor: CalendarEditor; class?: ClassValue } =
  $props()

let adder = $state<HTMLButtonElement>()

let title = $state("")

const quick = (e: SubmitEvent) => {
  e.preventDefault()

  const text = title.trim()

  if (text) {
    title = ""
    void editor.quickAdd(text)
  }
}
</script>

<section
  class={[
    "flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3",
    extra,
  ]}
>
  <header class="flex items-center gap-1">
    <DayHeading day={calendar.selected} />
    <IconButton
      icon="lucide:plus"
      label={m.calendar_add()}
      disabled={!editor.ready}
      bind:ref={adder}
      onclick={() => (editor.editing = "new")}
    />
  </header>
  {#if editor.editing}
    {@const current = editor.editing === "new" ? null : editor.editing}
    {#key editor.editing}
      <EventForm
        event={current}
        day={calendar.selected}
        tags={editor.tags}
        busy={editor.attempt.busy}
        onsave={editor.save}
        oncancel={() => {
          editor.editing = null
          adder?.focus()
        }}
        ondelete={current ? () => editor.remove(current) : undefined}
        oncreatetag={editor.createTag}
        onupdatetag={editor.updateTag}
        onremovetag={editor.removeTag}
        onnotesync={current ? on => editor.notesSync(current, on) : undefined}
      />
    {/key}
  {:else}
    <form onsubmit={quick}>
      <input
        class="input input-sm w-full"
        placeholder={m.panel_quick_add()}
        aria-label={m.panel_quick_add()}
        disabled={!editor.ready}
        bind:value={title}
      />
    </form>
    {#if editor.selected.length === 0}
      <EmptyState icon="lucide:calendar" text={m.calendar_empty()} />
    {:else}
      <DayPanel
        events={editor.selected}
        tags={editor.tags}
        onedit={event => (editor.editing = event)}
        onmenu={editor.menu}
        onopendoc={editor.openDoc}
      />
    {/if}
  {/if}
  <ErrorAlert message={editor.attempt.failure} />
</section>

{#if editor.asking}
  <ScopeDialog mode={editor.asking.mode} choose={editor.asking.answer} />
{/if}

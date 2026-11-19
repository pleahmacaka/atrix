<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import DateField from "./DateField.svelte"
import type { Draft } from "./draft.ts"
import TimeField from "./TimeField.svelte"

let {
  draft,
  change,
}: { draft: Draft; change: (next: Partial<Draft>) => void } = $props()
</script>

<DateField
  value={draft.date}
  label={m.panel_date()}
  onchange={date => change({ date })}
/>

{#if draft.allDay}
  <button
    type="button"
    class="btn btn-ghost btn-xs justify-start"
    onclick={() => change({ allDay: false })}
  >
    <Icon icon="lucide:plus" class="size-3.5" />
    {m.panel_time_add()}
  </button>
{:else}
  <div class="flex items-center gap-2">
    <div class="input input-sm min-w-0 flex-1 gap-0 pe-1">
      <TimeField
        value={draft.start}
        label={m.calendar_start()}
        onchange={start => change({ start })}
      />
      <button
        type="button"
        class="btn btn-ghost btn-circle btn-xs shrink-0 text-base-content/60"
        aria-label={m.panel_time_remove()}
        title={m.panel_time_remove()}
        onclick={() => change({ allDay: true })}
      >
        <Icon icon="lucide:x" class="size-3.5" />
      </button>
    </div>

    {#if draft.hasEnd}
      <span class="text-base-content/50">–</span>
      <div class="input input-sm min-w-0 flex-1 gap-0 pe-1">
        <TimeField
          value={draft.end}
          label={m.calendar_end()}
          onchange={end => change({ end })}
        />
        <button
          type="button"
          class="btn btn-ghost btn-circle btn-xs shrink-0 text-base-content/60"
          aria-label={m.panel_end_remove()}
          title={m.panel_end_remove()}
          onclick={() => change({ hasEnd: false })}
        >
          <Icon icon="lucide:x" class="size-3.5" />
        </button>
      </div>
    {/if}
  </div>

  {#if !draft.hasEnd}
    <button
      type="button"
      class="btn btn-ghost btn-xs justify-start"
      onclick={() => change({ hasEnd: true })}
    >
      <Icon icon="lucide:plus" class="size-3.5" />
      {m.panel_end_add()}
    </button>
  {/if}
{/if}

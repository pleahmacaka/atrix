<script lang="ts">
import { pad } from "#lib/calendar/dates.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import { m } from "#lib/paraglide/messages.js"
import WheelColumn from "./WheelColumn.svelte"

let {
  value,
  label,
  onchange,
}: {
  value: string
  label: string
  onchange: (value: string) => void
} = $props()

const hour = $derived(Number(value.slice(0, 2)))

const minute = $derived(Number(value.slice(3, 5)))

let open = $state(false)
</script>

<Popover {label} placement="bottom-start" bind:open>
  {#snippet trigger(p)}
    <button
      {...p}
      type="button"
      aria-label={label}
      class="min-w-0 grow cursor-pointer text-start tabular-nums"
    >
      {value}
    </button>
  {/snippet}
  {#if open}
    <div class="flex gap-1 p-1">
      <WheelColumn
        count={24}
        selected={hour}
        label={m.panel_hour()}
        pick={next => onchange(`${pad(next)}:${pad(minute)}`)}
      />
      <WheelColumn
        count={60}
        selected={minute}
        label={m.panel_minute()}
        pick={next => onchange(`${pad(hour)}:${pad(next)}`)}
      />
    </div>
  {/if}
</Popover>

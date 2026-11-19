<script lang="ts">
import { holidays } from "#lib/calendar/calendar.svelte.ts"
import { format } from "#lib/calendar/format.ts"

let { day }: { day: Date } = $props()

const names = $derived(holidays.names(day))
</script>

<div class="flex min-w-0 flex-1 flex-col ps-1">
  <h2 class="truncate text-sm font-semibold">
    {format(day, { month: "long", day: "numeric", weekday: "long" })}
  </h2>
  {#if names.length > 0}
    <span class="truncate text-xs text-error">{names.join(", ")}</span>
  {/if}
</div>

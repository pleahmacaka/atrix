<script lang="ts">
import { untrack } from "svelte"
import {
  addDays,
  calendar,
  format,
  pick,
  sameDay,
  TONES,
} from "#lib/calendar/calendar.svelte.ts"
import { listShared, type SharedEvent } from "#lib/calendar/shared.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

let { hosts }: { hosts: HostView[] } = $props()

let events = $state<SharedEvent[]>([])

$effect(() => {
  for (const host of hosts) {
    void host.dsChange
  }

  untrack(async () => {
    const now = new Date()

    events = await listShared(hosts, now, addDays(now, 30)).catch(() => [])
  })
})

const label = (e: SharedEvent) => {
  const start = new Date(e.start)
  const day = format(start, { month: "short", day: "numeric", weekday: "short" })

  return e.allDay
    ? day
    : `${day} ${format(start, { hour: "numeric", minute: "2-digit" })}`
}
</script>

<div class="flex flex-col gap-1 p-2">
  {#if events.length > 0}
    <ul class="flex flex-col" aria-label={m.calendar_upcoming()}>
      {#each events as event (event.id)}
        {@const start = new Date(event.start)}
        <li>
          <button
            type="button"
            class={[
              "flex w-full cursor-pointer items-start gap-2 rounded-field px-2 py-1.5 text-start text-sm",
              "transition-colors duration-140",
              sameDay(start, calendar.selected)
                ? "bg-primary/8 text-primary"
                : "hover:bg-base-content/8",
            ]}
            onclick={() => pick(addDays(start, 0))}
          >
            <span
              class={["mt-1.5 size-2 shrink-0 rounded-full", TONES[event.color]]}
            ></span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate">{event.title}</span>
              <span class="text-xs text-base-content/55 tabular-nums">
                {label(event)}
              </span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <EmptyState icon="lucide:calendar-clock" text={m.calendar_upcoming_empty()} />
  {/if}
</div>

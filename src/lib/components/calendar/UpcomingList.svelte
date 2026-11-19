<script lang="ts">
import { calendar, holidays, pick, sameDay } from "#lib/calendar/calendar.svelte.ts"
import { addDays, parseLocal, startOfDay } from "#lib/calendar/dates.ts"
import { clock, shortDay } from "#lib/calendar/format.ts"
import { type SharedEvent, watchShared } from "#lib/calendar/shared.ts"
import type { EventTag } from "#lib/calendar/store.ts"
import { colorOf } from "#lib/calendar/tags.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

let { hosts }: { hosts: HostView[] } = $props()

const HORIZON_DAYS = 30

let events = $state<SharedEvent[]>([])

let tags = $state<EventTag[]>([])

watchShared(
  () => {
    const now = new Date()

    return {
      hosts,
      from: now,
      to: addDays(now, HORIZON_DAYS),
      isHoliday: holidays.isHoliday,
    }
  },
  work => work().catch(() => {}),
  (found, known) => {
    events = found
    tags = known
  },
)

const label = (event: SharedEvent) => {
  const day = shortDay(parseLocal(event.start))

  return event.allDay ? day : `${day} ${clock(event.start)}`
}
</script>

<div class="flex flex-col gap-1 p-2">
  {#if events.length > 0}
    <ul class="flex flex-col" aria-label={m.calendar_upcoming()}>
      {#each events as event (`${event.host.id}:${event.id}:${event.start}`)}
        {@const start = parseLocal(event.start)}
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
            onclick={() => pick(startOfDay(start))}
          >
            <span
              class={["mt-1.5 size-2 shrink-0 rounded-full", colorOf(tags, event)]}
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

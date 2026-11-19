<script lang="ts">
import {
  holidays,
  isoWeek,
  prefs,
  sameDay,
  WEEKS,
  weeksFrom,
} from "#lib/calendar/calendar.svelte.ts"
import { dateKey, startOfDay } from "#lib/calendar/dates.ts"
import { format } from "#lib/calendar/format.ts"
import { onDay } from "#lib/calendar/occurrence.ts"
import type { SharedEvent } from "#lib/calendar/shared.svelte.ts"
import type { EventTag } from "#lib/calendar/store.ts"
import { m } from "#lib/paraglide/messages.js"
import DayCell from "./DayCell.svelte"

let {
  start,
  selected,
  events,
  tags,
  onpick,
}: {
  start: Date
  selected: Date
  events: SharedEvent[]
  tags: EventTag[]
  onpick: (day: Date) => void
} = $props()

const days = $derived(weeksFrom(start))

const today = startOfDay(new Date())

const weekdays = $derived(days.slice(0, 7))

const weeks = $derived(
  Array.from({ length: WEEKS }, (_, i) => days.slice(i * 7, i * 7 + 7)),
)

const items = $derived(
  new Map(days.map(d => [dateKey(d), events.filter(e => onDay(e, d))])),
)

const itemsOn = (d: Date) => items.get(dateKey(d)) ?? []
</script>

<section
  class="flex min-w-0 flex-1 flex-col gap-1 rounded-box border border-base-300 bg-base-100 p-3"
>
  <div class="flex gap-1">
    {#if prefs.weekNumbers}
      <span class="w-6 shrink-0"></span>
    {/if}
    <div class="grid flex-1 grid-cols-7 gap-1">
      {#each weekdays as weekday (weekday.getDay())}
        <span
          class={[
            "py-1 text-center text-xs @2xl:ps-1 @2xl:text-start",
            holidays.weekdayTone(weekday) ?? "text-base-content/55",
          ]}
        >
          {format(weekday, { weekday: "short" })}
        </span>
      {/each}
    </div>
  </div>
  {#each weeks as week (week[0].getTime())}
    <div class="flex gap-1">
      {#if prefs.weekNumbers}
        <span
          class="w-6 shrink-0 pt-2 text-center text-xs text-base-content/40 tabular-nums"
          title={m.calendar_week({ week: isoWeek(week[0]) })}
        >
          {isoWeek(week[0])}
        </span>
      {/if}
      <div class="grid flex-1 grid-cols-7 gap-1">
        {#each week as day (day.getTime())}
          <DayCell
            {day}
            {today}
            items={itemsOn(day)}
            names={holidays.names(day)}
            active={sameDay(day, selected)}
            {tags}
            onclick={() => onpick(day)}
          />
        {/each}
      </div>
    </div>
  {/each}
</section>

<script lang="ts">
import { holidays, sameDay } from "#lib/calendar/calendar.svelte.ts"
import { longDay } from "#lib/calendar/format.ts"
import type { SharedEvent } from "#lib/calendar/shared.ts"
import type { EventTag } from "#lib/calendar/store.ts"
import { colorOf } from "#lib/calendar/tags.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  day,
  today,
  items,
  names,
  active,
  tags,
  onclick,
}: {
  day: Date
  today: Date
  items: SharedEvent[]
  names: string[]
  active: boolean
  tags: EventTag[]
  onclick: () => void
} = $props()

const isToday = $derived(sameDay(day, today))

const past = $derived(day < today && !active)
</script>

<button
  type="button"
  class={[
    "relative flex min-h-14 min-w-0 cursor-pointer flex-col items-center gap-1 rounded-field p-1",
    "text-start transition-colors duration-140 @2xl:min-h-28 @2xl:items-start",
    active ? "bg-primary/8 text-primary" : "hover:bg-base-content/8",
    past && "opacity-50",
  ]}
  aria-pressed={active}
  aria-current={isToday ? "date" : undefined}
  aria-label={[longDay(day), ...names].join(", ")}
  {onclick}
>
  <span class="flex w-full min-w-0 items-center justify-center gap-1 @2xl:justify-start">
    <span
      class={[
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
        isToday
          ? "bg-primary font-semibold text-primary-content"
          : !active && holidays.dayTone(day),
      ]}
    >
      {day.getDate()}
    </span>
    {#if names.length > 0}
      <span
        class={[
          "hidden min-w-0 truncate text-xs @2xl:inline",
          holidays.isHoliday(day) ? "text-error" : "text-base-content/50",
        ]}
        title={names.join(", ")}
      >
        {names.join(", ")}
      </span>
    {/if}
  </span>
  <span class="flex flex-wrap justify-center gap-0.5 @2xl:hidden">
    {#each items.slice(0, 3) as item (item.id)}
      <span class={["size-1.5 rounded-full", colorOf(tags, item)]}></span>
    {/each}
  </span>
  <span class="hidden w-full min-w-0 flex-col gap-0.5 @2xl:flex">
    {#each items.slice(0, 2) as item (item.id)}
      <span class="flex min-w-0 items-center gap-1 text-xs">
        <span
          class={["size-1.5 shrink-0 rounded-full", colorOf(tags, item)]}
        ></span>
        <span class="truncate">{item.title}</span>
      </span>
    {/each}
    {#if items.length > 2}
      <span class="text-xs text-base-content/55 tabular-nums">
        {m.calendar_more({ count: items.length - 2 })}
      </span>
    {/if}
  </span>
</button>

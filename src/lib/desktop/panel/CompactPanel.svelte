<script lang="ts">
import Icon from "@iconify/svelte"
import { holidays, sameDay } from "#lib/calendar/calendar.svelte.ts"
import { dateKey } from "#lib/calendar/dates.ts"
import { format, longDay } from "#lib/calendar/format.ts"
import { isDone } from "#lib/calendar/occurrence.ts"
import { m } from "#lib/paraglide/messages.js"
import MonthNav from "./MonthNav.svelte"
import type { Morph } from "./morph.svelte.ts"
import PanelAside from "./PanelAside.svelte"
import type { Panel } from "./panel.svelte.ts"

const DOTS = 3

let { panel, morph }: { panel: Panel; morph: Morph } = $props()

const weekdays = $derived(
  panel.weeks[0].map(day => format(day, { weekday: "narrow" })),
)
</script>

<svelte:window onpointerup={panel.endDrag} onblur={panel.endDrag} />

<div
  {@attach morph.card}
  class={[
    "grid w-3xl grid-cols-12 gap-2 rounded-box border border-base-300 bg-base-200 p-2",
    !panel.ready && "opacity-60",
  ]}
>
  <section
    {@attach morph.monthCard}
    class="col-span-7 flex flex-col rounded-box border border-base-300 bg-base-100"
    aria-label={m.panel_calendar()}
  >
    <header class="flex min-h-14 items-center justify-between gap-3 ps-4 pe-2 pt-2">
      <div class="min-w-0">
        <h2 class="truncate text-base font-semibold tabular-nums">
          {panel.monthLabel}
        </h2>
        <p class="text-xs text-base-content/55 tabular-nums">
          {m.panel_today_date({ date: dateKey(panel.today) })}
        </p>
      </div>
      <MonthNav {panel}>
        <button
          type="button"
          class="btn btn-ghost btn-square btn-xs"
          aria-label={m.panel_expand()}
          title={m.panel_expand()}
          onclick={morph.expand}
        >
          <Icon icon="lucide:maximize-2" class="size-3.5" />
        </button>
      </MonthNav>
    </header>

    <div class="flex flex-col px-2 pb-2">
      <div class="grid grid-cols-7 gap-1">
        {#each weekdays as weekday, index (index)}
          <span
            class={[
              "py-2 text-center text-xs font-medium",
              holidays.weekdayTone(panel.weeks[0][index]) ?? "text-base-content/45",
            ]}
          >
            {weekday}
          </span>
        {/each}
      </div>

      <div class="grid grid-cols-7 grid-rows-6 gap-1">
        {#each panel.weeks as week (dateKey(week[0]))}
          {#each week as day (dateKey(day))}
            {@const outside = day.getMonth() !== panel.month}
            {@const isToday = sameDay(day, panel.today)}
            {@const isSelected = sameDay(day, panel.selected)}
            <button
              type="button"
              class={[
                "flex h-14 cursor-pointer flex-col items-center gap-1.5 rounded-field pt-2",
                "transition-colors duration-120",
                outside && "*:opacity-40",
                panel.rangeTone(day),
                isSelected
                  ? "bg-primary/8 text-primary"
                  : !panel.inRange(day) && "hover:bg-base-content/8",
              ]}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              aria-label={[longDay(day), ...holidays.names(day)].join(", ")}
              onclick={() => panel.pick(day)}
              onpointerdown={e => e.button === 0 && panel.beginDrag(day)}
              onpointerenter={() => panel.extendDrag(day)}
            >
              <span
                class={[
                  "grid size-7 place-items-center rounded-field text-sm tabular-nums",
                  isToday
                    ? "bg-primary font-semibold text-primary-content"
                    : ["font-medium", !isSelected && holidays.dayTone(day)],
                ]}
              >
                {day.getDate()}
              </span>
              <span class="flex h-2 items-center gap-1">
                {#each panel.eventsOn(day).slice(0, DOTS) as event (event.id + event.start)}
                  <span
                    class={[
                      "size-1.5 rounded-full",
                      panel.dotTone(event),
                      isDone(event) && "opacity-30",
                    ]}
                  ></span>
                {/each}
              </span>
            </button>
          {/each}
        {/each}
      </div>
    </div>
  </section>

  <div class="relative col-span-5">
    <div class="absolute inset-0 flex">
      <PanelAside {panel} />
    </div>
  </div>
</div>

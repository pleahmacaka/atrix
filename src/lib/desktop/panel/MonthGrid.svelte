<script lang="ts">
import Icon from "@iconify/svelte"
import { on } from "svelte/events"
import {
  holidays,
  isoWeek,
  prefs,
  sameDay,
} from "#lib/calendar/calendar.svelte.ts"
import { notesText } from "#lib/calendar/citations.ts"
import { dateKey } from "#lib/calendar/dates.ts"
import { clock, eventSpan, format, longDay } from "#lib/calendar/format.ts"
import { RECURRENCE_LABELS } from "#lib/calendar/labels.ts"
import { isDone } from "#lib/calendar/occurrence.ts"
import type { SharedEvent } from "#lib/calendar/shared.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import type { Panel } from "./panel.svelte.ts"

const CHIPS = 3

const PREVIEW_DELAY_MS = 350

const PREVIEW_WIDTH = 16

const PREVIEW_HEIGHT = 10

const PREVIEW_GAP = 0.25

const NOTE_LINES = 3

let { panel }: { panel: Panel } = $props()

type Preview = { event: SharedEvent; left: number; top: number }

let preview = $state<Preview | null>(null)

let tip = $state<HTMLDivElement>()

let timer: ReturnType<typeof setTimeout> | undefined

const rootRem = () =>
  Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

const showPreview = (e: Event, event: SharedEvent) => {
  if (!(e.currentTarget instanceof HTMLElement)) {
    return
  }

  const box = e.currentTarget.getBoundingClientRect()

  clearTimeout(timer)
  timer = setTimeout(() => {
    const rem = rootRem()
    const bottom = box.bottom / rem
    const below = bottom + PREVIEW_GAP + PREVIEW_HEIGHT <= innerHeight / rem

    preview = {
      event,
      left: Math.max(
        PREVIEW_GAP,
        Math.min(box.left / rem, innerWidth / rem - PREVIEW_WIDTH - PREVIEW_GAP),
      ),
      top: below
        ? bottom + PREVIEW_GAP
        : Math.max(PREVIEW_GAP, box.top / rem - PREVIEW_GAP - PREVIEW_HEIGHT),
    }
  }, PREVIEW_DELAY_MS)
}

const hidePreview = () => {
  clearTimeout(timer)
  preview = null
}

$effect(() => {
  if (preview && tip && !tip.matches(":popover-open")) {
    tip.showPopover()
  } else if (!preview && tip?.matches(":popover-open")) {
    tip.hidePopover()
  }
})

const noteLines = (notes: string) =>
  notesText(notes)
    .split("\n")
    .filter(line => line.trim() !== "")
    .slice(0, NOTE_LINES)

const weekdays = $derived(
  panel.weeks[0].map(day => format(day, { weekday: "short" })),
)

</script>

<svelte:window onpointerup={panel.endDrag} onblur={panel.endDrag} />

<div class="flex gap-1">
  {#if prefs.weekNumbers}
    <span class="w-6 shrink-0"></span>
  {/if}
  <div class="grid flex-1 grid-cols-7 gap-1">
    {#each weekdays as weekday, index (index)}
      <span
        class={[
          "px-1 py-1.5 text-xs font-medium",
          holidays.weekdayTone(panel.weeks[0][index]) ?? "text-base-content/45",
        ]}
      >
        <span class="inline-flex min-w-6 justify-center">{weekday}</span>
      </span>
    {/each}
  </div>
</div>

<div class="flex min-h-0 flex-1 flex-col gap-1 select-none">
  {#each panel.weeks as week (dateKey(week[0]))}
    <div class="flex min-h-0 flex-1 gap-1">
      {#if prefs.weekNumbers}
        <span
          class="flex h-7 w-6 shrink-0 items-center justify-center text-xs text-base-content/40 tabular-nums"
          title={m.calendar_week({ week: isoWeek(week[0]) })}
        >
          {isoWeek(week[0])}
        </span>
      {/if}
      <div class="grid min-h-0 flex-1 grid-cols-7 gap-1">
        {#each week as day (dateKey(day))}
          {@const outside = day.getMonth() !== panel.month}
          {@const dayEvents = panel.eventsOn(day)}
          {@const names = holidays.names(day)}
          {@const isToday = sameDay(day, panel.today)}
          {@const isSelected = sameDay(day, panel.selected)}
          {@const shown = dayEvents.length > CHIPS ? CHIPS - 1 : CHIPS}
          <div
            class={[
              "relative flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden rounded-field p-1",
              "transition-colors duration-120",
              outside && "*:opacity-40",
              panel.rangeTone(day),
              isSelected
                ? "bg-primary/8"
                : !panel.inRange(day) && "hover:bg-base-content/8",
            ]}
            {@attach node => on(node, "pointerenter", () => panel.extendDrag(day))}
          >
            <button
              type="button"
              class="absolute inset-0 cursor-pointer rounded-field"
              aria-label={[longDay(day), ...names].join(", ")}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              onclick={() => panel.pick(day)}
              onpointerdown={e => e.button === 0 && panel.beginDrag(day)}
            ></button>
            <div class="pointer-events-none relative flex min-w-0 items-center gap-1">
              <span
                class={[
                  "grid size-6 shrink-0 place-items-center rounded-field text-xs tabular-nums",
                  isToday
                    ? "bg-primary font-semibold text-primary-content"
                    : isSelected
                      ? "font-medium text-primary"
                      : ["font-medium", holidays.dayTone(day)],
                ]}
              >
                {day.getDate()}
              </span>
              {#if names.length > 0}
                <span
                  class={[
                    "min-w-0 truncate text-xs font-medium",
                    holidays.isHoliday(day) ? "text-error" : "text-base-content/50",
                  ]}
                  title={names.join(", ")}
                >
                  {names.join(", ")}
                </span>
              {/if}
            </div>

            {#each dayEvents.slice(0, shown) as event (event.id + event.start)}
              <button
                type="button"
                class={[
                  "relative flex h-5 w-full min-w-0 shrink-0 cursor-pointer items-center gap-1",
                  "rounded-selector px-1 text-start text-xs text-base-content/85",
                  "transition-colors duration-120",
                  event.allDay
                    ? [panel.colorOf(event).block, "font-medium"]
                    : "hover:bg-base-content/8",
                ]}
                aria-label={`${event.allDay ? m.calendar_all_day() : clock(event.start)} ${event.title}`}
                onpointerenter={e => showPreview(e, event)}
                onpointerleave={hidePreview}
                onfocus={e => showPreview(e, event)}
                onblur={hidePreview}
                onclick={e => {
                  e.stopPropagation()
                  hidePreview()
                  panel.show(event)
                }}
              >
                {#if !event.allDay}
                  <span class={["size-1.5 shrink-0 rounded-full", panel.dotTone(event)]}></span>
                {/if}
                <span class={["truncate", isDone(event) && "line-through opacity-60"]}>
                  {event.title}
                </span>
              </button>
            {/each}

            {#if dayEvents.length > shown}
              <span
                class={[
                  "pointer-events-none relative flex h-5 shrink-0 items-center px-1",
                  "text-xs font-medium text-base-content/60 tabular-nums",
                ]}
              >
                {m.calendar_more({ count: dayEvents.length - shown })}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<div
  bind:this={tip}
  popover="manual"
  role="tooltip"
  class={[
    "popover-box pointer-events-none fixed inset-auto m-0 w-64 flex-col gap-1.5 p-3",
    "hidden open:flex",
  ]}
  style:left="{preview?.left ?? 0}rem"
  style:top="{preview?.top ?? 0}rem"
>
  {#if preview}
    {@const lines = noteLines(preview.event.notes)}
    <div class="flex min-w-0 items-center gap-2">
      <span class={["size-2 shrink-0 rounded-full", panel.colorOf(preview.event).chip]}></span>
      <span
        class={[
          "truncate text-sm font-semibold",
          isDone(preview.event) && "text-base-content/60 line-through",
        ]}
      >
        {preview.event.title}
      </span>
    </div>
    <div class="flex items-center gap-2 text-xs text-base-content/65 tabular-nums">
      <span>{eventSpan(preview.event, m.calendar_all_day())}</span>
      {#if preview.event.recurrence !== "none"}
        <span class="flex items-center gap-1">
          <Icon icon="lucide:repeat" class="size-3" />
          {RECURRENCE_LABELS[preview.event.recurrence]()}
        </span>
      {/if}
    </div>
    {#if lines.length > 0}
      <p class="pt-1 text-xs leading-relaxed text-base-content/75">
        {#each lines as line, index (index)}
          <span class="block truncate">{line}</span>
        {/each}
      </p>
    {/if}
  {/if}
</div>

<script lang="ts">
import Icon from "@iconify/svelte"
import { holidays } from "#lib/calendar/calendar.svelte.ts"
import { parseLocal } from "#lib/calendar/dates.ts"
import { clock, format, shortDay } from "#lib/calendar/format.ts"
import { isDone, openEnded } from "#lib/calendar/occurrence.ts"
import type { SharedEvent } from "#lib/calendar/shared.svelte.ts"
import { tagLabel, tagsOf } from "#lib/calendar/tags.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Panel } from "./panel.svelte.ts"

type Zone = "before" | "after" | "group"

const EDGE = 0.3

let { panel }: { panel: Panel } = $props()

const ranged = $derived(panel.rangeEnd !== null)

const sections = $derived(panel.daySections)

const monthDay = (day: Date) => format(day, { month: "long", day: "numeric" })

const heading = $derived(
  panel.rangeEnd
    ? `${monthDay(panel.selected)} – ${monthDay(panel.rangeEnd)}`
    : monthDay(panel.selected),
)

const weekday = $derived(
  ranged ? null : format(panel.selected, { weekday: "long" }),
)

const empty = $derived(
  sections.every(
    ({ day, events }) =>
      events.length === 0 &&
      holidays.names(day).length === 0 &&
      panel.hiddenOn(day).length === 0,
  ),
)

const keyOf = (event: SharedEvent) => event.id + event.start

const clusters = (list: SharedEvent[]) => {
  const members = Map.groupBy(
    list.filter(e => e.group),
    e => e.group ?? "",
  )
  const placed = new Set<string>()

  return list.flatMap(e => {
    const group = e.group ? members.get(e.group) : undefined

    if (!e.group || !group || group.length < 2) {
      return [[e]]
    }

    if (placed.has(e.group)) {
      return []
    }

    placed.add(e.group)

    return [group]
  })
}

let dragged = $state<SharedEvent | null>(null)

let over = $state<{ key: string; zone: Zone } | null>(null)

const zoneOf = (e: DragEvent & { currentTarget: HTMLElement }, event: SharedEvent): Zone => {
  const box = e.currentTarget.getBoundingClientRect()
  const at = (e.clientY - box.top) / box.height
  const sortable = !ranged && event.allDay && dragged?.allDay

  if (sortable && at < EDGE) {
    return "before"
  }

  return sortable && at > 1 - EDGE ? "after" : "group"
}

const reset = () => {
  dragged = null
  over = null
}

const dragOver = (e: DragEvent & { currentTarget: HTMLElement }, event: SharedEvent) => {
  if (!dragged || keyOf(dragged) === keyOf(event)) {
    return
  }

  e.preventDefault()
  over = { key: keyOf(event), zone: zoneOf(e, event) }
}

const drop = async (e: DragEvent, event: SharedEvent) => {
  e.preventDefault()

  const moved = dragged
  const zone = over?.zone

  reset()

  if (!moved || !zone) {
    return
  }

  if (zone === "group") {
    await panel.groupWith(moved, event)
  } else {
    await panel.reorderDay(moved.id, event.id, zone === "after")
  }
}

const opened = (event: SharedEvent) =>
  panel.openEvent?.id === event.id && panel.openEvent.start === event.start
</script>

{#snippet holidayRow(name: string, offDay: boolean)}
  <li class="flex items-stretch gap-1">
    <span class="w-5 shrink-0"></span>
    <span class="mt-2 w-11 shrink-0 text-xs leading-5 font-medium text-base-content/70">
      {m.calendar_all_day()}
    </span>
    <span class="mt-2 flex h-5 w-4 shrink-0 items-center">
      <Icon
        icon="lucide:flag"
        class={["size-3", offDay ? "text-error" : "text-base-content/50"]}
      />
    </span>
    <span
      class={[
        "min-w-0 flex-1 py-2 pe-9 text-sm font-medium break-words",
        offDay && "text-error",
      ]}
      title={m.panel_holiday()}
    >
      {name}
    </span>
  </li>
{/snippet}

{#snippet row(event: SharedEvent)}
  {@const parent = panel.parentOf(event)?.title}
  {@const labels = tagsOf(panel.tags, event).map(tagLabel)}
  {@const done = isDone(event)}
  {@const target = over?.key === keyOf(event) ? over.zone : null}
  <li
    class={["group relative", dragged && keyOf(dragged) === keyOf(event) && "opacity-40"]}
    draggable="true"
    ondragstart={e => {
      dragged = event

      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move"
      }
    }}
    ondragover={e => dragOver(e, event)}
    ondragleave={() => (over = null)}
    ondrop={e => drop(e, event)}
    ondragend={reset}
  >
    {#if target === "before" || target === "after"}
      <span
        class={[
          "absolute inset-x-1 z-10 h-0.5 rounded-full bg-primary",
          target === "after" ? "-bottom-0.25" : "-top-0.25",
        ]}
      ></span>
    {/if}

    <div
      class={[
        "flex items-stretch gap-1 rounded-field transition-colors duration-120",
        opened(event)
          ? "bg-primary/8 text-primary"
          : "hover:bg-base-content/8",
        target === "group" && "outline-2 outline-primary/60",
      ]}
    >
      <span
        class={[
          "flex w-5 shrink-0 cursor-grab items-center justify-center",
          "text-base-content/25 transition-colors group-hover:text-base-content/45",
        ]}
        aria-hidden="true"
      >
        <Icon icon="lucide:grip-vertical" class="size-3.5" />
      </span>

      <span class="flex w-11 shrink-0 flex-col pt-2 text-xs text-base-content/70 tabular-nums">
        {#if event.allDay}
          <span class="leading-5 font-medium">{m.calendar_all_day()}</span>
        {:else}
          <span class="leading-5 font-medium">{clock(event.start)}</span>
          {#if !openEnded(event)}
            <span class="text-base-content/50">{clock(event.end)}</span>
          {/if}
        {/if}
      </span>

      <span class="mt-2 flex h-5 w-4 shrink-0 items-center">
        {#if event.task}
          <input
            type="checkbox"
            class="checkbox checkbox-primary checkbox-xs"
            checked={done}
            aria-label={done ? m.panel_task_undo() : m.panel_task_done()}
            onchange={() => panel.toggleDone(event)}
          />
        {:else}
          <span class={["size-2 rounded-full", panel.dotTone(event)]}></span>
        {/if}
      </span>

      <button
        type="button"
        class="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 py-2 pe-9 text-start"
        onclick={() => panel.show(event)}
      >
        <span
          class={[
            "line-clamp-2 text-sm font-medium break-words",
            done && "text-base-content/50 line-through",
          ]}
        >
          {event.title}
        </span>

        {#if event.shiftedFrom}
          <span class="text-xs text-warning">
            {m.calendar_shifted_from({ date: shortDay(parseLocal(event.shiftedFrom)) })}
          </span>
        {/if}

        {#if parent || labels.length > 0}
          <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-base-content/55">
            {#if parent}
              <span class="flex min-w-0 items-center gap-0.5">
                <Icon icon="lucide:corner-down-right" class="size-3 shrink-0" />
                <span class="truncate">{parent}</span>
              </span>
            {/if}
            {#each labels as label (label)}
              <span>#{label}</span>
            {/each}
          </span>
        {/if}
      </button>

      <button
        type="button"
        class={[
          "btn btn-ghost btn-square btn-xs absolute end-1.5 top-1.5",
          "text-base-content/60 opacity-0 transition-opacity duration-120",
          "group-hover:opacity-100 group-focus-within:opacity-100",
          "hover:text-error focus-visible:opacity-100",
        ]}
        aria-label={m.common_delete()}
        title={m.common_delete()}
        onclick={() => panel.remove(event)}
      >
        <Icon icon="lucide:trash-2" class="size-3.5" />
      </button>
    </div>
  </li>
{/snippet}

{#snippet list(events: SharedEvent[])}
  {#each clusters(events) as members (keyOf(members[0]))}
    {#if members.length === 1}
      {@render row(members[0])}
    {:else}
      <li
        class={[
          "my-0.5 rounded-box border border-primary/25 bg-primary/5",
          "transition-colors duration-120 hover:border-primary/50",
        ]}
        aria-label={m.panel_group()}
      >
        <ul class="flex flex-col">
          {#each members as event (keyOf(event))}
            {@render row(event)}
          {/each}
        </ul>
      </li>
    {/if}
  {/each}
{/snippet}

<section class="flex h-full min-h-0 flex-col" aria-label={heading}>
  <header class="flex items-center justify-between gap-2 ps-4 pe-2 pt-2.5 pb-1">
    <h2 class="truncate text-sm font-semibold">
      {heading}
      {#if weekday}
        <span class="ms-1 text-xs font-normal text-base-content/60">{weekday}</span>
      {/if}
    </h2>
    <button
      type="button"
      class="btn btn-ghost btn-square btn-xs shrink-0"
      aria-label={m.calendar_add()}
      title={m.calendar_add()}
      onclick={panel.startNew}
    >
      <Icon icon="lucide:plus" class="size-4" />
    </button>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto p-2">
    {#if empty}
      <EmptyState icon="lucide:calendar" text={m.calendar_empty()} centered class="h-full" />
    {:else}
      {#each sections as { day, events: visible } (day.getTime())}
        {@const names = holidays.names(day)}
        {@const hidden = panel.hiddenOn(day)}
        {@const revealed = panel.isRevealed(day)}
        {@const events = revealed ? [...visible, ...hidden] : visible}
        {@const allDay = events.filter(e => e.allDay)}
        {@const timed = events.filter(e => !e.allDay)}

        {#if ranged && names.length + events.length > 0}
          <h3 class="px-2 pt-2 pb-1 text-xs font-semibold text-base-content/55">
            {shortDay(day)}
          </h3>
        {/if}

        {#if names.length + allDay.length > 0}
          <ul class={["flex flex-col", timed.length > 0 && "mb-3"]}>
            {#each names as name (name)}
              {@render holidayRow(name, holidays.isHoliday(day))}
            {/each}
            {@render list(allDay)}
          </ul>
        {/if}

        {#if timed.length > 0}
          <ul class="flex flex-col">
            {@render list(timed)}
          </ul>
        {/if}

        {#if hidden.length > 0}
          <button
            type="button"
            class={[
              "mt-0.5 flex w-full cursor-pointer items-center gap-1.5 rounded-field py-1 ps-7 pe-2",
              "text-xs text-base-content/50 transition-colors duration-120",
              "hover:bg-base-content/8 hover:text-base-content/70",
            ]}
            aria-expanded={revealed}
            onclick={() => panel.toggleReveal(day)}
          >
            <Icon icon={revealed ? "lucide:eye" : "lucide:eye-off"} class="size-3" />
            {revealed
              ? m.panel_hide_again({ count: hidden.length })
              : m.panel_hidden_count({ count: hidden.length })}
            <Icon
              icon="lucide:chevron-down"
              class={["ms-auto size-3 transition-transform", revealed && "rotate-180"]}
            />
          </button>
        {/if}
      {/each}
    {/if}
    <ErrorAlert message={panel.attempt.failure} />
  </div>
</section>

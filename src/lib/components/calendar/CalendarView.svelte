<script lang="ts">
import { untrack } from "svelte"
import {
  addDays,
  calendar,
  format,
  onDay,
  pick,
  sameDay,
  TONES,
  timeRange,
  WEEKS,
  weeksFrom,
} from "#lib/calendar/calendar.svelte.ts"
import {
  addEvent,
  CALENDAR,
  type CalendarEvent,
  deleteEvent,
  type EventInput,
  listEvents,
  updateEvent,
} from "#lib/calendar/events.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import PageHeader from "#lib/components/ui/PageHeader.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import EventForm from "./EventForm.svelte"

let { host }: { host: HostView } = $props()

const attempt = new Attempt()

let events = $state<CalendarEvent[]>([])

let editing = $state<CalendarEvent | "new" | null>(null)

let adder = $state<HTMLButtonElement>()

const days = $derived(weeksFrom(calendar.start))

const today = addDays(new Date(), 0)

const weekdays = weeksFrom(addDays(today, -today.getDay()))
  .slice(0, 7)
  .map(d => format(d, { weekday: "short" }))

const selected = $derived(events.filter(e => onDay(e, calendar.selected)))

$effect(() => {
  const change = host.dsChange
  const from = days[0]
  const to = addDays(days[days.length - 1], 1)

  if (change?.name && change.name !== CALENDAR) {
    return
  }

  untrack(() =>
    attempt.run(async () => {
      events = await listEvents(host, from, to)
    }),
  )
})

const shift = (pages: number) => {
  calendar.start = addDays(calendar.start, pages * WEEKS * 7)
}

const focus = $derived(addDays(calendar.start, 7))

const title = $derived(format(focus, { year: "numeric", month: "long" }))

const choose = (day: Date) => {
  editing = null
  pick(day)
}

const save = (input: EventInput) =>
  attempt.run(async () => {
    if (editing === "new") {
      await addEvent(host, input, settings.deviceName)
    } else if (editing) {
      await updateEvent(host, editing.id, input)
    }

    editing = null
  })

const remove = (event: CalendarEvent) =>
  attempt.run(async () => {
    await deleteEvent(host, event.id)

    editing = null
  })

const menu = (e: MouseEvent, event: CalendarEvent) =>
  contextMenu.show(e, [
    {
      label: m.calendar_edit(),
      icon: "lucide:pencil",
      run: () => (editing = event),
    },
    "separator",
    {
      label: m.common_delete(),
      icon: "lucide:trash-2",
      danger: true,
      confirm: m.common_confirm_delete(),
      run: () => remove(event),
    },
  ])
</script>

<div class="@container flex min-h-0 flex-1 flex-col">
  <PageHeader
    icon="lucide:calendar"
    title={title}
    class="tabular-nums"
  >
    {#snippet actions()}
      <IconButton
        icon="lucide:chevron-left"
        label={m.calendar_prev()}
        onclick={() => shift(-1)}
      />
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        onclick={() => choose(addDays(new Date(), 0))}
      >
        {m.calendar_today()}
      </button>
      <IconButton
        icon="lucide:chevron-right"
        label={m.calendar_next()}
        onclick={() => shift(1)}
      />
    {/snippet}
  </PageHeader>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div
      class="flex flex-col gap-3 px-4 pb-4 sm:px-6 sm:pb-6 @2xl:flex-row @2xl:items-start"
    >
      <section
        class="flex min-w-0 flex-1 flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3"
        aria-label={title}
      >
        <div class="grid grid-cols-7 gap-1">
          {#each weekdays as weekday (weekday)}
            <span class="py-1 text-center text-xs text-base-content/55 @2xl:ps-1 @2xl:text-start">
              {weekday}
            </span>
          {/each}
          {#each days as day (day.getTime())}
            {@const items = events.filter(e => onDay(e, day))}
            {@const active = sameDay(day, calendar.selected)}
            <button
              type="button"
              class={[
                "flex min-h-14 min-w-0 cursor-pointer flex-col items-center gap-1 rounded-field p-1",
                "text-start transition-colors duration-140 @2xl:min-h-28 @2xl:items-start",
                active ? "bg-primary/8 text-primary" : "hover:bg-base-content/8",
                day < today && !sameDay(day, today) && !active && "text-base-content/40",
              ]}
              aria-pressed={active}
              aria-label={format(day, { dateStyle: "full" })}
              onclick={() => choose(day)}
            >
              <span
                class={[
                  "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                  sameDay(day, today) && "bg-primary font-semibold text-primary-content",
                ]}
              >
                {day.getDate()}
              </span>
              <span class="flex flex-wrap gap-0.5 @2xl:hidden">
                {#each items.slice(0, 3) as item (item.id)}
                  <span class={["size-1.5 rounded-full", TONES[item.color]]}></span>
                {/each}
              </span>
              <span class="hidden w-full min-w-0 flex-col gap-0.5 @2xl:flex">
                {#each items.slice(0, 2) as item (item.id)}
                  <span class="flex min-w-0 items-center gap-1 text-xs">
                    <span
                      class={["size-1.5 shrink-0 rounded-full", TONES[item.color]]}
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
          {/each}
        </div>
      </section>
      <section
        class={[
          "flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3",
          "@2xl:sticky @2xl:top-0 @2xl:w-72 @2xl:shrink-0 @4xl:w-80",
        ]}
      >
        <header class="flex items-center gap-1">
          <h2 class="min-w-0 flex-1 truncate ps-1 text-sm font-semibold">
            {format(calendar.selected, {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </h2>
          <IconButton
            icon="lucide:plus"
            label={m.calendar_add()}
            bind:ref={adder}
            onclick={() => (editing = "new")}
          />
        </header>
        {#if editing}
          {@const current = editing === "new" ? null : editing}
          {#key editing}
            <EventForm
              event={current}
              day={calendar.selected}
              busy={attempt.busy}
              onsave={save}
              oncancel={() => {
                editing = null
                adder?.focus()
              }}
              ondelete={current ? () => remove(current) : undefined}
            />
          {/key}
        {:else if selected.length === 0}
          <EmptyState icon="lucide:calendar" text={m.calendar_empty()} />
        {:else}
          <ul class="flex flex-col gap-0.5">
            {#each selected as event (event.id)}
              <li>
                <button
                  type="button"
                  class={[
                    "flex w-full cursor-pointer items-start gap-2 rounded-field px-2 py-1.5",
                    "text-start transition-colors duration-140 hover:bg-base-content/8",
                  ]}
                  onclick={() => (editing = event)}
                  oncontextmenu={e => menu(e, event)}
                >
                  <span
                    class={["mt-1.5 size-2 shrink-0 rounded-full", TONES[event.color]]}
                  ></span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-sm">{event.title}</span>
                    <span class="text-xs text-base-content/55 tabular-nums">
                      {event.allDay ? m.calendar_all_day() : timeRange(event)}
                    </span>
                    {#if event.note}
                      <span class="line-clamp-2 text-xs text-base-content/55">
                        {event.note}
                      </span>
                    {/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <ErrorAlert message={attempt.failure} />
      </section>
    </div>
  </div>
</div>

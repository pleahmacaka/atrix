<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import {
  calendar,
  holidays,
  isoWeek,
  pick,
  prefs,
  sameDay,
  WEEKS,
  weeksFrom,
} from "#lib/calendar/calendar.svelte.ts"
import { deleteTag, type EventTag, putTag } from "#lib/calendar/events.ts"
import { eventSpan, format, longDay } from "#lib/calendar/format.ts"
import {
  addDays,
  type CalendarEvent,
  inSeries,
  onDay,
  parseLocal,
  type Scope,
  startOfDay,
} from "#lib/calendar/recurrence.ts"
import {
  notesOnly,
  removeOccurrence,
  saveOccurrence,
  setNotesSync,
} from "#lib/calendar/series.ts"
import {
  listShared,
  type SharedEvent,
  sharedTags,
} from "#lib/calendar/shared.ts"
import { colorOf, newTag, tagLabel, tagsOf } from "#lib/calendar/tags.ts"
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
import ScopeDialog from "./ScopeDialog.svelte"

let { hosts }: { hosts: HostView[] } = $props()

const attempt = new Attempt()

let events = $state<SharedEvent[]>([])

let tags = $state<EventTag[]>([])

let editing = $state<SharedEvent | "new" | null>(null)

let asking = $state<{
  mode: "edit" | "delete"
  answer: (scope: Scope | null) => void
} | null>(null)

let adder = $state<HTMLButtonElement>()

const days = $derived(weeksFrom(calendar.start))

const today = startOfDay(new Date())

const weekdays = $derived(days.slice(0, 7))

const weeks = $derived(
  Array.from({ length: WEEKS }, (_, i) => days.slice(i * 7, i * 7 + 7)),
)

const selected = $derived(events.filter(e => onDay(e, calendar.selected)))

const keyOf = (e: SharedEvent) => `${e.host.id}:${e.id}:${e.start}`

$effect(() => {
  void holidays.load()
})

$effect(() => {
  const from = days[0]
  const to = addDays(days[days.length - 1], 1)
  const isHoliday = holidays.isHoliday

  for (const host of hosts) {
    void host.dsChange
  }

  untrack(() =>
    attempt.run(async () => {
      ;[events, tags] = await Promise.all([
        listShared(hosts, from, to, isHoliday),
        sharedTags(hosts),
      ])
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

const askScope = (mode: "edit" | "delete") =>
  new Promise<Scope | null>(resolve => {
    asking = {
      mode,
      answer: scope => {
        asking = null
        resolve(scope)
      },
    }
  })

const targetHost = () => (editing && editing !== "new" ? editing.host : hosts[0])

const save = async (draft: CalendarEvent) => {
  const current = editing === "new" ? null : editing
  const scoped =
    current?.seriesDate && !(current.notesSync && notesOnly(current, draft))
  const scope = scoped ? await askScope("edit") : null

  if (scoped && !scope) {
    return
  }

  await attempt.run(async () => {
    await saveOccurrence(targetHost(), current, draft, scope)

    editing = null
  })
}

const remove = async (event: SharedEvent) => {
  const scope = event.seriesDate ? await askScope("delete") : null

  if (event.seriesDate && !scope) {
    return
  }

  await attempt.run(async () => {
    await removeOccurrence(event.host, event, scope)

    editing = null
  })
}

const createTag = async (name: string) => {
  const tag = newTag(tags, name)
  const created = await attempt.run(async () => {
    await putTag(targetHost(), tag)
    tags = [...tags, tag]
  })

  return created ? tag.id : null
}

const updateTag = (tag: EventTag) =>
  attempt.run(async () => {
    await Promise.all(hosts.map(h => putTag(h, tag)))
    tags = tags.map(t => (t.id === tag.id ? tag : t))
  })

const removeTag = (tag: EventTag) =>
  attempt.run(async () => {
    await Promise.all(hosts.map(h => deleteTag(h, tag.id)))
    tags = tags.filter(t => t.id !== tag.id)
  })

const menu = (e: MouseEvent, event: SharedEvent) =>
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
      confirm: event.seriesDate ? undefined : m.common_confirm_delete(),
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
        onclick={() => choose(startOfDay(new Date()))}
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
        class="flex min-w-0 flex-1 flex-col gap-1 rounded-box border border-base-300 bg-base-100 p-3"
        aria-label={title}
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
                {@const items = events.filter(e => onDay(e, day))}
                {@const active = sameDay(day, calendar.selected)}
                {@const names = holidays.namesOn(day)}
                {@const past = day < today && !active}
                <button
                  type="button"
                  class={[
                    "relative flex min-h-14 min-w-0 cursor-pointer flex-col items-center gap-1 rounded-field p-1",
                    "text-start transition-colors duration-140 @2xl:min-h-28 @2xl:items-start",
                    active ? "bg-primary/8 text-primary" : "hover:bg-base-content/8",
                    past && "opacity-50",
                  ]}
                  aria-pressed={active}
                  aria-current={sameDay(day, today) ? "date" : undefined}
                  aria-label={[longDay(day), ...names].join(", ")}
                  onclick={() => choose(day)}
                >
                  <span class="flex w-full min-w-0 items-center justify-center gap-1 @2xl:justify-start">
                    <span
                      class={[
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
                        sameDay(day, today)
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
                    {#each items.slice(0, 3) as item (keyOf(item))}
                      <span class={["size-1.5 rounded-full", colorOf(tags, item)]}></span>
                    {/each}
                  </span>
                  <span class="hidden w-full min-w-0 flex-col gap-0.5 @2xl:flex">
                    {#each items.slice(0, 2) as item (keyOf(item))}
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
              {/each}
            </div>
          </div>
        {/each}
      </section>
      <section
        class={[
          "flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3",
          "@2xl:sticky @2xl:top-0 @2xl:w-72 @2xl:shrink-0 @4xl:w-80",
        ]}
      >
        <header class="flex items-center gap-1">
          <div class="flex min-w-0 flex-1 flex-col ps-1">
            <h2 class="truncate text-sm font-semibold">
              {format(calendar.selected, {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </h2>
            {#if holidays.namesOn(calendar.selected).length > 0}
              <span class="truncate text-xs text-error">
                {holidays.namesOn(calendar.selected).join(", ")}
              </span>
            {/if}
          </div>
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
              author={settings.deviceName}
              {tags}
              busy={attempt.busy}
              onsave={save}
              oncancel={() => {
                editing = null
                adder?.focus()
              }}
              ondelete={current ? () => remove(current) : undefined}
              oncreatetag={createTag}
              onupdatetag={updateTag}
              onremovetag={removeTag}
              onnotesync={current
                ? on => attempt.run(() => setNotesSync(current.host, current, on))
                : undefined}
            />
          {/key}
        {:else if selected.length === 0}
          <EmptyState icon="lucide:calendar" text={m.calendar_empty()} />
        {:else}
          <ul class="flex flex-col gap-0.5">
            {#each selected as event (keyOf(event))}
              {@const labels = tagsOf(tags, event).map(tagLabel)}
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
                    class={["mt-1.5 size-2 shrink-0 rounded-full", colorOf(tags, event)]}
                  ></span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="flex min-w-0 items-center gap-1 text-sm">
                      <span class="truncate">{event.title}</span>
                      {#if inSeries(event)}
                        <Icon
                          icon="lucide:repeat"
                          class="size-3 shrink-0 text-base-content/50"
                        />
                      {/if}
                    </span>
                    <span class="text-xs text-base-content/55 tabular-nums">
                      {eventSpan(event, m.calendar_all_day())}
                    </span>
                    {#if event.shiftedFrom}
                      <span class="text-xs text-base-content/55">
                        {m.calendar_shifted_from({
                          date: format(parseLocal(event.shiftedFrom), {
                            month: "short",
                            day: "numeric",
                          }),
                        })}
                      </span>
                    {/if}
                    {#if labels.length > 0}
                      <span class="truncate text-xs text-base-content/55">
                        {labels.join(", ")}
                      </span>
                    {/if}
                    {#if event.notes}
                      <span class="line-clamp-2 text-xs text-base-content/55">
                        {event.notes}
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

{#if asking}
  <ScopeDialog mode={asking.mode} choose={asking.answer} />
{/if}

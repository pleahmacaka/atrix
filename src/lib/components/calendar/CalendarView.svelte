<script lang="ts">
import {
  notesOnly,
  removeOccurrence,
  saveOccurrence,
  setNotesSync,
} from "#lib/calendar/actions.ts"
import { calendar, holidays, pick, WEEKS } from "#lib/calendar/calendar.svelte.ts"
import { addDays, startOfDay } from "#lib/calendar/dates.ts"
import { format } from "#lib/calendar/format.ts"
import { onDay } from "#lib/calendar/occurrence.ts"
import { type SharedEvent, watchShared } from "#lib/calendar/shared.ts"
import { deleteTag, type EventTag, putTag } from "#lib/calendar/store.ts"
import { newTag } from "#lib/calendar/tags.ts"
import type { CalendarEvent, Scope } from "#lib/calendar/types.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import PageHeader from "#lib/components/ui/PageHeader.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"
import DayHeading from "./DayHeading.svelte"
import DayPanel from "./DayPanel.svelte"
import EventForm from "./EventForm.svelte"
import MonthGrid from "./MonthGrid.svelte"
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

const selected = $derived(events.filter(event => onDay(event, calendar.selected)))

const title = $derived(
  format(addDays(calendar.start, 7), { year: "numeric", month: "long" }),
)

$effect(() => {
  void holidays.load()
})

watchShared(
  () => ({
    hosts,
    from: calendar.start,
    to: addDays(calendar.start, WEEKS * 7),
    isHoliday: holidays.isHoliday,
  }),
  attempt.run,
  (found, known) => {
    events = found
    tags = known
  },
)

const shift = (pages: number) => {
  calendar.start = addDays(calendar.start, pages * WEEKS * 7)
}

const choose = (day: Date) => {
  editing = null
  pick(day)
}

const askScope = (mode: "edit" | "delete") =>
  new Promise<Scope | null>(resolve => {
    asking = { mode, answer: resolve }
  })

const targetHost = () => (editing && editing !== "new" ? editing.host : hosts[0])

const save = async (draft: CalendarEvent) => {
  const current = editing === "new" ? null : editing
  const scoped =
    current?.seriesDate !== undefined &&
    !(current.notesSync && notesOnly(current, draft))
  const scope = scoped ? await askScope("edit") : null

  if (scope || !current?.seriesDate) {
    await attempt.run(async () => {
      await saveOccurrence(targetHost(), current, draft, scope)

      editing = null
    })
  }
}

const remove = async (event: SharedEvent) => {
  const direct = event.seriesDate === undefined
  const scope = direct ? null : await askScope("delete")

  if (direct || scope) {
    await attempt.run(async () => {
      await removeOccurrence(event.host, event, scope)

      editing = null
    })
  }
}

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
</script>

<div class="@container flex min-h-0 flex-1 flex-col">
  <PageHeader icon="lucide:calendar" {title} class="tabular-nums">
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
      <div class="flex min-w-0 flex-1">
        <MonthGrid
          start={calendar.start}
          selected={calendar.selected}
          {events}
          {tags}
          onpick={choose}
        />
      </div>
      <section
        class={[
          "flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3",
          "@2xl:sticky @2xl:top-0 @2xl:w-72 @2xl:shrink-0 @4xl:w-80",
        ]}
      >
        <header class="flex items-center gap-1">
          <DayHeading day={calendar.selected} />
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
          <DayPanel
            events={selected}
            {tags}
            onedit={event => (editing = event)}
            onmenu={menu}
          />
        {/if}
        <ErrorAlert message={attempt.failure} />
      </section>
    </div>
  </div>
</div>

{#if asking}
  <ScopeDialog mode={asking.mode} choose={asking.answer} />
{/if}

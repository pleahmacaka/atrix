<script lang="ts">
import { calendar, WEEKS } from "#lib/calendar/calendar.svelte.ts"
import { addDays, startOfDay } from "#lib/calendar/dates.ts"
import { CalendarEditor } from "#lib/calendar/editor.svelte.ts"
import { format } from "#lib/calendar/format.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import PageHeader from "#lib/components/ui/PageHeader.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { goPage, nav } from "#lib/store/nav.svelte.ts"
import DayAgenda from "./DayAgenda.svelte"
import MonthGrid from "./MonthGrid.svelte"
import TaskList from "./TaskList.svelte"

let { hosts }: { hosts: HostView[] } = $props()

const editor = new CalendarEditor(
  () => hosts,
  id => {
    nav.doc = id
    goPage("knowledge")
  },
)

const title = $derived(
  format(addDays(calendar.start, 7), { year: "numeric", month: "long" }),
)

const shift = (pages: number) => {
  calendar.start = addDays(calendar.start, pages * WEEKS * 7)
}
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
        onclick={() => editor.choose(startOfDay(new Date()))}
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
          events={editor.events}
          tags={editor.tags}
          onpick={editor.choose}
        />
      </div>
      <div
        class={[
          "flex flex-col gap-3",
          "@2xl:sticky @2xl:top-0 @2xl:w-72 @2xl:shrink-0 @4xl:w-80",
        ]}
      >
        <DayAgenda {editor} />
        <TaskList {editor} />
      </div>
    </div>
  </div>
</div>

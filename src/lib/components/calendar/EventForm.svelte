<script lang="ts">
import { untrack } from "svelte"
import { on } from "svelte/events"
import { cite } from "#lib/calendar/citations.ts"
import { dateKey } from "#lib/calendar/dates.ts"
import { blankDraft } from "#lib/calendar/draft.ts"
import { shiftable } from "#lib/calendar/occurrence.ts"
import type { EventTag } from "#lib/calendar/store.ts"
import { COLOR_KEYS, COLORS } from "#lib/calendar/tags.ts"
import {
  type CalendarEvent,
  type Occurrence,
  RECURRENCES,
  REMINDERS,
  type Recurrence,
  SHIFTS,
  type Shift,
} from "#lib/calendar/types.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import type { Entry } from "#lib/knowledge/store.ts"
import { m } from "#lib/paraglide/messages.js"
import DocPicker from "./DocPicker.svelte"
import TagPicker from "./TagPicker.svelte"

type Reminder = (typeof REMINDERS)[number]

let {
  event,
  day,
  tags,
  busy,
  onsave,
  oncancel,
  ondelete,
  oncreatetag,
  onupdatetag,
  onremovetag,
  onnotesync,
}: {
  event: Occurrence | null
  day: Date
  tags: EventTag[]
  busy: boolean
  onsave: (draft: CalendarEvent) => void
  oncancel: () => void
  ondelete?: () => void
  oncreatetag: (name: string) => Promise<string | null>
  onupdatetag: (tag: EventTag) => unknown
  onremovetag: (tag: EventTag) => unknown
  onnotesync?: (on: boolean) => void
} = $props()

const RECURRENCE_LABELS: Record<Recurrence, () => string> = {
  none: m.calendar_recurrence_none,
  daily: m.calendar_recurrence_daily,
  weekdays: m.calendar_recurrence_weekdays,
  weekly: m.calendar_recurrence_weekly,
  monthly: m.calendar_recurrence_monthly,
  yearly: m.calendar_recurrence_yearly,
}

const SHIFT_LABELS: Record<Shift | "", () => string> = {
  "": m.calendar_shift_none,
  next: m.calendar_shift_next,
  previous: m.calendar_shift_previous,
}

const reminderLabel = (minutes: Reminder) => {
  switch (minutes) {
    case null:
      return m.panel_reminder_none()
    case 0:
      return m.panel_reminder_start()
    case 60:
      return m.panel_reminder_hour()
    case 1440:
      return m.panel_reminder_day()
    default:
      return m.panel_reminder_minutes({ count: minutes })
  }
}

const base = untrack(() => event ?? blankDraft(day))

type Form = Pick<
  CalendarEvent,
  | "title"
  | "allDay"
  | "start"
  | "end"
  | "notes"
  | "color"
  | "recurrence"
  | "tags"
  | "reminder"
> & { until: string; shift: Shift | "" }

const form = $state<Form>({
  title: base.title,
  allDay: base.allDay,
  start: base.start,
  end: base.end,
  notes: base.notes,
  color: base.color,
  recurrence: base.recurrence,
  until: base.until ?? "",
  shift: base.shift ?? "",
  tags: [...base.tags],
  reminder: base.reminder,
})

let notesSync = $state(untrack(() => event?.notesSync ?? false))

let notesField = $state<HTMLTextAreaElement>()

const insertCitation = (entry: Entry) => {
  const at = notesField?.selectionEnd ?? form.notes.length
  const before = form.notes.slice(0, at)
  const gap = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : ""

  form.notes = `${before}${gap}${cite(entry.meta.id, entry.meta.title)}${form.notes.slice(at)}`
}

const toggleAllDay = (allDay: boolean) => {
  form.allDay = allDay
  form.start = allDay ? form.start.slice(0, 10) : `${form.start}T09:00`
  form.end = allDay ? form.end.slice(0, 10) : `${form.end}T10:00`
}

const submit = (e: SubmitEvent) => {
  e.preventDefault()

  const recurring = form.recurrence !== "none"

  onsave({
    ...base,
    ...form,
    title: form.title.trim(),
    until: recurring && form.until ? form.until : null,
    shift: recurring && shiftable(form.recurrence) && form.shift ? form.shift : null,
    reminder: form.allDay ? null : form.reminder,
  })
}

const today = dateKey(new Date())
</script>

<form
  class="flex flex-col gap-2"
  onsubmit={submit}
  {@attach node =>
    on(node, "keydown", e => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        oncancel()
      }
    })}
>
  <input
    class="input input-sm w-full"
    {@attach node => node.focus()}
    placeholder={m.calendar_field_title()}
    aria-label={m.calendar_field_title()}
    required
    bind:value={form.title}
  />
  <label class="flex cursor-pointer items-center gap-2 text-sm">
    <input
      type="checkbox"
      class="toggle toggle-sm toggle-primary"
      checked={form.allDay}
      onchange={e => toggleAllDay(e.currentTarget.checked)}
    />
    {m.calendar_all_day()}
  </label>
  <label class="flex flex-col gap-1 text-xs text-base-content/60">
    {m.calendar_start()}
    <input
      type={form.allDay ? "date" : "datetime-local"}
      class="input input-sm w-full tabular-nums"
      required
      bind:value={form.start}
    />
  </label>
  <label class="flex flex-col gap-1 text-xs text-base-content/60">
    {m.calendar_end()}
    <input
      type={form.allDay ? "date" : "datetime-local"}
      class="input input-sm w-full tabular-nums"
      required
      min={form.start}
      bind:value={form.end}
    />
  </label>
  {#if !form.allDay}
    <label class="flex flex-col gap-1 text-xs text-base-content/60">
      {m.panel_reminder()}
      <select class="select select-sm w-full" bind:value={form.reminder}>
        {#each REMINDERS as option (option)}
          <option value={option}>{reminderLabel(option)}</option>
        {/each}
      </select>
    </label>
  {/if}
  <label class="flex flex-col gap-1 text-xs text-base-content/60">
    {m.calendar_repeat()}
    <select class="select select-sm w-full" bind:value={form.recurrence}>
      {#each RECURRENCES as option (option)}
        <option value={option}>{RECURRENCE_LABELS[option]()}</option>
      {/each}
    </select>
  </label>
  {#if form.recurrence !== "none"}
    <label class="flex flex-col gap-1 text-xs text-base-content/60">
      {m.calendar_until()}
      <input
        type="date"
        class="input input-sm w-full tabular-nums"
        min={form.start.slice(0, 10) || today}
        bind:value={form.until}
      />
    </label>
    {#if shiftable(form.recurrence)}
      <label class="flex flex-col gap-1 text-xs text-base-content/60">
        {m.calendar_shift()}
        <select class="select select-sm w-full" bind:value={form.shift}>
          {#each ["", ...SHIFTS] as const as option (option)}
            <option value={option}>{SHIFT_LABELS[option]()}</option>
          {/each}
        </select>
      </label>
    {/if}
  {/if}
  <div class="flex flex-col gap-1 text-xs text-base-content/60">
    {m.calendar_tags()}
    <TagPicker
      {tags}
      bind:selected={form.tags}
      oncreate={oncreatetag}
      onupdate={onupdatetag}
      onremove={onremovetag}
    />
  </div>
  <textarea
    class="textarea textarea-sm w-full"
    rows="3"
    placeholder={m.calendar_note()}
    aria-label={m.calendar_note()}
    bind:this={notesField}
    bind:value={form.notes}
  ></textarea>
  <div class="flex">
    <DocPicker onpick={insertCitation} />
  </div>
  {#if event?.seriesDate && onnotesync}
    <label class="flex cursor-pointer items-center gap-2 text-xs text-base-content/60">
      <input
        type="checkbox"
        class="toggle toggle-xs toggle-primary"
        bind:checked={notesSync}
        onchange={() => onnotesync(notesSync)}
      />
      {m.calendar_notes_sync()}
    </label>
  {/if}
  <div
    class="flex flex-wrap items-center gap-2"
    role="radiogroup"
    aria-label={m.calendar_color()}
  >
    {#each COLOR_KEYS as color (color)}
      <input
        type="radio"
        name="event-color"
        aria-label={COLORS[color].label()}
        title={COLORS[color].label()}
        class={[
          "size-5 cursor-pointer appearance-none rounded-full ring-2 ring-offset-2 ring-offset-base-100",
          "ring-transparent transition-shadow duration-140 hover:ring-base-content/25",
          "checked:ring-base-content/70",
          COLORS[color].chip,
        ]}
        value={color}
        bind:group={form.color}
      />
    {/each}
  </div>
  <div class="flex items-center gap-2 pt-1">
    {#if ondelete}
      {#if event?.seriesDate}
        <button
          type="button"
          class="btn btn-ghost btn-sm text-error"
          disabled={busy}
          onclick={ondelete}
        >
          {m.common_delete()}
        </button>
      {:else}
        <ConfirmButton
          label={m.common_delete()}
          disabled={busy}
          onconfirm={ondelete}
        />
      {/if}
    {/if}
    <span class="flex-1"></span>
    <button type="button" class="btn btn-ghost btn-sm" onclick={oncancel}>
      {m.common_cancel()}
    </button>
    <button type="submit" class="btn btn-primary btn-sm" disabled={busy}>
      {m.common_save()}
    </button>
  </div>
</form>

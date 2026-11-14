<script lang="ts">
import { on } from "svelte/events"
import { addDays, dateValue, timeValue } from "#lib/calendar/calendar.svelte.ts"
import type { CalendarEvent, EventInput } from "#lib/calendar/events.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  event,
  day,
  busy,
  onsave,
  oncancel,
  ondelete,
}: {
  event: CalendarEvent | null
  day: Date
  busy: boolean
  onsave: (input: EventInput) => void
  oncancel: () => void
  ondelete?: () => void
} = $props()

const COLORS = [
  { value: "", label: m.calendar_color_primary, tone: "radio-primary" },
  { value: "success", label: m.calendar_color_success, tone: "radio-success" },
  { value: "warning", label: m.calendar_color_warning, tone: "radio-warning" },
  { value: "error", label: m.calendar_color_error, tone: "radio-error" },
]

const initial = () => {
  if (!event) {
    const start = addDays(day, 0)

    start.setHours(9)

    const end = new Date(start)

    end.setHours(10)

    return {
      title: "",
      allDay: false,
      start: timeValue(start),
      end: timeValue(end),
      note: "",
      color: "",
    }
  }

  const start = new Date(event.start)
  const end = new Date(event.end)

  return {
    title: event.title,
    allDay: event.allDay,
    start: event.allDay ? dateValue(start) : timeValue(start),
    end: event.allDay ? dateValue(addDays(end, -1)) : timeValue(end),
    note: event.note,
    color: event.color,
  }
}

const form = $state(initial())

const toggleAllDay = (on: boolean) => {
  form.allDay = on
  form.start = on ? form.start.slice(0, 10) : `${form.start}T09:00`
  form.end = on ? form.end.slice(0, 10) : `${form.end}T10:00`
}

const submit = (e: SubmitEvent) => {
  e.preventDefault()

  const end = form.allDay
    ? dateValue(addDays(new Date(`${form.end}T00:00`), 1))
    : form.end

  onsave({ ...form, end })
}
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
  <div class="grid grid-cols-1 gap-2">
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
  </div>
  <textarea
    class="textarea textarea-sm w-full"
    rows="3"
    placeholder={m.calendar_note()}
    aria-label={m.calendar_note()}
    bind:value={form.note}
  ></textarea>
  <div
    class="flex items-center gap-2"
    role="radiogroup"
    aria-label={m.calendar_color()}
  >
    {#each COLORS as color (color.value)}
      <input
        type="radio"
        name="color"
        value={color.value}
        aria-label={color.label()}
        title={color.label()}
        class={["radio radio-sm cursor-pointer", color.tone]}
        bind:group={form.color}
      />
    {/each}
  </div>
  <div class="flex items-center gap-2 pt-1">
    {#if ondelete}
      <ConfirmButton
        label={m.common_delete()}
        disabled={busy}
        onconfirm={ondelete}
      />
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

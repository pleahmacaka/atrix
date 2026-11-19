<script lang="ts">
import Icon from "@iconify/svelte"
import { addDays, parseLocal } from "#lib/calendar/dates.ts"
import { format } from "#lib/calendar/format.ts"
import {
  RECURRENCE_LABELS,
  reminderLabel,
  SHIFT_LABELS,
} from "#lib/calendar/labels.ts"
import { shiftable } from "#lib/calendar/occurrence.ts"
import { tagLabel } from "#lib/calendar/tags.ts"
import { RECURRENCES, REMINDERS, SHIFTS } from "#lib/calendar/types.ts"
import TagPicker from "#lib/components/calendar/TagPicker.svelte"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import DateEditor from "./DateEditor.svelte"
import type { Draft } from "./draft.ts"
import type { EditingState, Field } from "./editing.svelte.ts"
import type { Panel } from "./panel.svelte.ts"

const SHIFT_OPTIONS = ["none", ...SHIFTS] as const

const FIELD_LABELS: Record<"reminder" | "tags" | "task", () => string> = {
  reminder: m.panel_reminder,
  tags: m.calendar_tags,
  task: m.panel_task,
}

const POPPED = "[data-pop], [popover], [role=menu]"

let { panel, editor }: { panel: Panel; editor: EditingState } = $props()

const draft = $derived(editor.draft)

const open = $derived(editor.open)

const tags = $derived(panel.tags.filter(tag => draft.tags.includes(tag.id)))

const optional = $derived(
  (["reminder", "tags", "task"] as const).filter(
    field =>
      (field === "reminder" && draft.reminder === null) ||
      (field === "tags" && draft.tags.length === 0) ||
      (field === "task" && !draft.task),
  ),
)

const dateLabel = (day: Date) =>
  format(day, {
    year: day.getFullYear() === panel.today.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
  })

const dayPeriod = (hour: number) =>
  new Intl.DateTimeFormat(getLocale(), { hour: "numeric", hour12: true })
    .formatToParts(new Date(2000, 0, 1, hour))
    .find(part => part.type === "dayPeriod")?.value ?? ""

const spoken = (time: string) => {
  const [hour, minute] = time.split(":").map(Number)
  const values = {
    period: dayPeriod(hour),
    hour: hour % 12 || 12,
    minute,
    padded: String(minute).padStart(2, "0"),
  }

  return minute === 0 ? m.panel_clock_hour(values) : m.panel_clock_minute(values)
}

const repeatDate = (value: Draft, day: Date) => {
  switch (value.recurrence) {
    case "daily":
      return m.calendar_recurrence_daily()
    case "weekdays":
      return m.calendar_recurrence_weekdays()
    case "weekly":
      return m.panel_every_weekly({ date: format(day, { weekday: "long" }) })
    case "monthly":
      return m.panel_every_monthly({ date: format(day, { day: "numeric" }) })
    case "yearly":
      return m.panel_every_yearly({
        date: format(day, { month: "long", day: "numeric" }),
      })
    default:
      return dateLabel(day)
  }
}

const whenLabel = (value: Draft) => {
  const day = parseLocal(value.date)
  const date = repeatDate(value, day)
  const lastDay =
    value.days > 0 && value.recurrence === "none"
      ? dateLabel(addDays(day, value.days))
      : null

  if (value.allDay) {
    return lastDay ? `${date} – ${lastDay}` : date
  }

  const start = `${date} ${spoken(value.start)}`

  if (!value.hasEnd) {
    return start
  }

  return lastDay
    ? `${start} – ${lastDay} ${spoken(value.end)}`
    : `${start} – ${spoken(value.end)}`
}

const when = $derived(whenLabel(draft))

const mousedown = (e: MouseEvent) => {
  if (open && !(e.target instanceof Element && e.target.closest(POPPED))) {
    editor.open = null
  }
}

const keydowncapture = (e: KeyboardEvent) => {
  if (e.key === "Escape" && open && !document.querySelector(":popover-open")) {
    e.stopPropagation()
    editor.open = null
  }
}
</script>

<svelte:window onmousedown={mousedown} onkeydowncapture={keydowncapture} />

{#snippet row(field: Field, title: string, content: string)}
  <div class="flex gap-3">
    <dt class="w-16 shrink-0 pt-1 text-base-content/60">{title}</dt>
    <dd class="relative min-w-0 flex-1" data-pop>
      <button
        type="button"
        class={[
          "-ms-2 flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-field px-2 py-1",
          "text-start transition-colors duration-120 hover:bg-base-content/8",
          open === field && "bg-base-content/8",
        ]}
        aria-expanded={open === field}
        onclick={() => editor.toggle(field)}
      >
        <span class="truncate">{content}</span>
      </button>
      {#if open === field}
        <div class="popover-box absolute end-0 top-full z-30 mt-1 flex w-64 flex-col gap-2 p-3 text-sm">
          {@render popover(field)}
        </div>
      {/if}
    </dd>
  </div>
{/snippet}

{#snippet choice(selected: boolean, text: string, pick: () => void)}
  <button
    type="button"
    class={[
      "flex cursor-pointer items-center justify-between rounded-field px-2 py-1.5 text-start",
      "transition-colors duration-120",
      selected ? "bg-primary/8 font-medium text-primary" : "hover:bg-base-content/8",
    ]}
    onclick={pick}
  >
    {text}
    {#if selected}
      <Icon icon="lucide:check" class="size-3.5" />
    {/if}
  </button>
{/snippet}

{#snippet popover(field: Field)}
  {#if field === "date"}
    <DateEditor {draft} change={editor.change} />
  {:else if field === "repeat"}
    <div class="flex flex-col gap-0.5">
      {#each RECURRENCES as option (option)}
        {@render choice(draft.recurrence === option, RECURRENCE_LABELS[option](), () =>
          editor.change({ recurrence: option }),
        )}
      {/each}
    </div>
    {#if shiftable(draft.recurrence)}
      <label class="flex flex-col gap-1 pt-1 text-xs text-base-content/60">
        {m.calendar_shift()}
        <select
          class="select select-sm w-full"
          value={draft.shift}
          onchange={e => {
            const shift = SHIFT_OPTIONS.find(o => o === e.currentTarget.value)

            if (shift) {
              editor.change({ shift })
            }
          }}
        >
          {#each SHIFT_OPTIONS as option (option)}
            <option value={option}>{SHIFT_LABELS[option === "none" ? "" : option]()}</option>
          {/each}
        </select>
      </label>
    {/if}
  {:else if field === "reminder"}
    <div class="flex flex-col gap-0.5">
      {#each REMINDERS as option (option)}
        {@render choice(draft.reminder === option, reminderLabel(option), () =>
          editor.change({ reminder: option }),
        )}
      {/each}
    </div>
  {:else if field === "tags"}
    <TagPicker
      tags={panel.tags}
      bind:selected={() => draft.tags, next => editor.change({ tags: next })}
      oncreate={panel.createTag}
      onupdate={panel.updateTag}
      onremove={panel.removeTag}
    />
  {:else if field === "task"}
    <label class="flex cursor-pointer items-center justify-between">
      {m.panel_task()}
      <input
        type="checkbox"
        class="toggle toggle-primary toggle-sm"
        checked={draft.task}
        onchange={e => editor.change({ task: e.currentTarget.checked })}
      />
    </label>
  {/if}
{/snippet}

<dl class="mt-5 flex flex-col gap-1 text-sm">
  {@render row("date", m.panel_date(), when)}
  {@render row("repeat", m.calendar_repeat(), RECURRENCE_LABELS[draft.recurrence]())}
  {#if draft.reminder !== null}
    {@render row("reminder", m.panel_reminder(), reminderLabel(draft.reminder))}
  {/if}
  {#if draft.tags.length > 0 || open === "tags"}
    {@render row(
      "tags",
      m.calendar_tags(),
      tags.map(tagLabel).join(", ") || m.panel_none(),
    )}
  {/if}
  {#if draft.task}
    {@render row("task", m.panel_task(), m.common_enabled())}
  {/if}

  {#if optional.length > 0}
    <div class="relative" data-pop>
      <button
        type="button"
        class="btn btn-ghost btn-xs mt-1 text-base-content/60"
        aria-expanded={open === "add"}
        onclick={() => editor.toggle("add")}
      >
        <Icon icon="lucide:plus" class="size-3.5" />
        {m.panel_field_add()}
      </button>
      {#if open === "add"}
        <div class="popover-box absolute start-0 top-full z-30 mt-1 flex w-48 flex-col gap-0.5 p-1.5 text-sm">
          {#each optional as field (field)}
            {@render choice(false, FIELD_LABELS[field](), () => editor.addField(field))}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</dl>

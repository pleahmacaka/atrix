<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { holidays, prefs, sameDay } from "#lib/calendar/calendar.svelte.ts"
import { dateKey, parseLocal, startOfDay } from "#lib/calendar/dates.ts"
import { format, longDay } from "#lib/calendar/format.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import { m } from "#lib/paraglide/messages.js"
import { monthGrid } from "./projections.ts"

let {
  value,
  label,
  onchange,
}: {
  value: string
  label: string
  onchange: (value: string) => void
} = $props()

let open = $state(false)

let shown = $state(untrack(() => parseLocal(value)))

const day = $derived(parseLocal(value))

const today = startOfDay(new Date())

const weeks = $derived(
  monthGrid(shown.getFullYear(), shown.getMonth(), prefs.weekStartsOn),
)

$effect(() => {
  if (open) {
    shown = parseLocal(value)
  }
})

const shift = (months: number) => {
  shown = new Date(shown.getFullYear(), shown.getMonth() + months, 1)
}

const pick = (next: Date) => {
  onchange(dateKey(next))
  open = false
}
</script>

<Popover {label} placement="bottom-start" width="w-64" bind:open>
  {#snippet trigger(p)}
    <button
      {...p}
      type="button"
      aria-label={label}
      class="input input-sm w-full cursor-pointer justify-start gap-2 tabular-nums"
    >
      <Icon icon="lucide:calendar-days" class="size-4 shrink-0 text-base-content/60" />
      <span class="truncate">{longDay(day)}</span>
    </button>
  {/snippet}
  <div class="flex flex-col gap-1 p-1">
    <div class="flex items-center justify-between gap-1">
      <button
        type="button"
        class="btn btn-ghost btn-square btn-xs"
        aria-label={m.calendar_prev()}
        title={m.calendar_prev()}
        onclick={() => shift(-1)}
      >
        <Icon icon="lucide:chevron-left" class="size-3.5" />
      </button>
      <span class="text-sm font-medium tabular-nums">
        {format(shown, { year: "numeric", month: "long" })}
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-square btn-xs"
        aria-label={m.calendar_next()}
        title={m.calendar_next()}
        onclick={() => shift(1)}
      >
        <Icon icon="lucide:chevron-right" class="size-3.5" />
      </button>
    </div>
    <div class="grid grid-cols-7">
      {#each weeks[0] as weekday (weekday.getDay())}
        <span
          class={[
            "py-1 text-center text-xs",
            holidays.weekdayTone(weekday) ?? "text-base-content/45",
          ]}
        >
          {format(weekday, { weekday: "narrow" })}
        </span>
      {/each}
      {#each weeks.flat() as cell (dateKey(cell))}
        {@const picked = sameDay(cell, day)}
        <button
          type="button"
          class={[
            "grid aspect-square cursor-pointer place-items-center rounded-field text-xs tabular-nums",
            "transition-colors duration-120",
            cell.getMonth() !== shown.getMonth() && "opacity-40",
            picked
              ? "bg-primary font-semibold text-primary-content"
              : [
                  "hover:bg-base-content/8",
                  sameDay(cell, today) ? "font-semibold text-primary" : holidays.dayTone(cell),
                ],
          ]}
          aria-pressed={picked}
          aria-label={longDay(cell)}
          onclick={() => pick(cell)}
        >
          {cell.getDate()}
        </button>
      {/each}
    </div>
  </div>
</Popover>

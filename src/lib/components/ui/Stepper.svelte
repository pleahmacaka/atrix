<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Bounds } from "#lib/store/settings.svelte.ts"

let {
  label,
  value,
  range,
  unit = "",
  onchange,
}: {
  label: string
  value: number
  range: Bounds
  unit?: string
  onchange: (value: number) => void
} = $props()

const step = (direction: number) => {
  const offset = (value - range.min) / range.step
  const index = direction > 0 ? Math.floor(offset) + 1 : Math.ceil(offset) - 1

  onchange(Math.min(range.max, Math.max(range.min, range.min + index * range.step)))
}
</script>

<fieldset class="join flex min-w-0 rounded-field bg-base-content/6" aria-label={label}>
  <button
    type="button"
    class="btn btn-ghost btn-sm btn-square join-item"
    aria-label={m.stepper_decrease({ label })}
    disabled={value <= range.min}
    onclick={() => step(-1)}
  >
    <Icon icon="lucide:minus" class="size-4" />
  </button>
  <span
    class="join-item grid w-14 place-items-center text-sm tabular-nums"
    aria-live="polite"
  >
    {value}{unit}
  </span>
  <button
    type="button"
    class="btn btn-ghost btn-sm btn-square join-item"
    aria-label={m.stepper_increase({ label })}
    disabled={value >= range.max}
    onclick={() => step(1)}
  >
    <Icon icon="lucide:plus" class="size-4" />
  </button>
</fieldset>

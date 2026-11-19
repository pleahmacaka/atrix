<script lang="ts">
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import Stepper from "#lib/components/ui/Stepper.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Bounds } from "#lib/store/settings.svelte.ts"

let {
  title,
  tip,
  value,
  range,
  onchange,
  unit = "",
}: {
  title: string
  tip?: string
  value: number
  range: Bounds
  onchange: (value: number) => void
  unit?: string
} = $props()
</script>

<SettingRow {title} {tip}>
  <button
    type="button"
    class={["btn btn-sm", value === range.base && "invisible"]}
    onclick={() => onchange(range.base)}
  >
    {m.common_reset()}
  </button>
  <Stepper label={title} {value} {range} {unit} {onchange} />
</SettingRow>

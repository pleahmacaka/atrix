<script lang="ts">
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import Stepper from "#lib/components/ui/Stepper.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Bounds } from "#lib/store/settings.svelte.ts"

let {
  title,
  value,
  range,
  onchange,
  unit = "",
}: {
  title: string
  value: number
  range: Bounds
  onchange: (value: number) => void
  unit?: string
} = $props()
</script>

<SettingRow {title}>
  <Stepper label={title} {value} {range} {unit} {onchange} />
  <button
    type="button"
    class="btn btn-sm"
    disabled={value === range.base}
    onclick={() => onchange(range.base)}
  >
    {m.common_reset()}
  </button>
</SettingRow>
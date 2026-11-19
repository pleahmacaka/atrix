<script lang="ts">
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"

let {
  title,
  tip,
  value,
  presets,
  onchange,
}: {
  title: string
  tip?: string
  value: number
  presets: { value: number; label: string }[]
  onchange: (value: number) => void
} = $props()

const items = $derived(presets.map(p => ({ id: String(p.value), label: p.label })))
</script>

<SettingRow {title} {tip}>
  <Segmented
    label={title}
    {items}
    value={String(value)}
    onpick={id => onchange(Number(id))}
  />
</SettingRow>

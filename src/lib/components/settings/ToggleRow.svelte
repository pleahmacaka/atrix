<script lang="ts">
import SettingRow from "#lib/components/ui/SettingRow.svelte"

let {
  title,
  checked,
  disabled = false,
  onchange,
}: {
  title: string
  checked: boolean
  disabled?: boolean
  onchange: (checked: boolean) => void
} = $props()
</script>

<SettingRow {title}>
  <input
    type="checkbox"
    class="toggle toggle-sm toggle-primary"
    aria-label={title}
    {checked}
    {disabled}
    onchange={e => onchange(e.currentTarget.checked)}
  />
</SettingRow>

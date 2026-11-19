<script lang="ts">
import type { Snippet } from "svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"

let {
  icon,
  name,
  url,
  editing,
  children,
}: { icon: string; name: string; url: string; editing: boolean; children: Snippet } = $props()
</script>

<div
  class={[
    "-mx-2 rounded-field px-2 transition-colors duration-140",
    editing && "bg-primary/8 text-primary",
  ]}
>
  <SettingRow {icon} title={name}>
    <div class="flex min-w-0 items-center justify-end gap-1">
      <span class="min-w-0 truncate text-sm text-base-content/60" title={url}>{url}</span>
      {@render children()}
    </div>
  </SettingRow>
</div>
<script lang="ts">
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { SHORTCUTS } from "#lib/store/shortcuts.ts"
</script>

{#each SHORTCUTS as shortcut (shortcut.id)}
  <SettingRow icon={shortcut.icon} title={shortcut.label}>
    <span class="flex justify-end gap-1 whitespace-nowrap">
      {#each shortcut.keys as key (key)}
        <kbd class="kbd kbd-sm">{key}</kbd>
      {/each}
    </span>
  </SettingRow>
{/each}

<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { SHORTCUTS } from "#lib/store/shortcuts.ts"
</script>

<ul class="flex flex-col">
  {#each SHORTCUTS as shortcut (shortcut.label)}
    <li class="flex items-center gap-3 border-b border-base-300 py-3 last:border-b-0">
      <span class="grid size-8 shrink-0 place-items-center rounded-field bg-base-200">
        <Icon icon={shortcut.icon} class="size-4 text-base-content/70" />
      </span>
      <span class="min-w-0 flex-1 text-sm">{shortcut.label}</span>
      <span class="flex gap-1 whitespace-nowrap">
        {#each shortcut.keys as key (key)}
          <kbd class="kbd kbd-sm">{key}</kbd>
        {/each}
      </span>
    </li>
  {/each}
</ul>
<p class="mt-4 flex items-center gap-2 text-xs text-base-content/60">
  <Icon icon="lucide:info" class="size-4 shrink-0" />
  {m.shortcut_note()}
</p>

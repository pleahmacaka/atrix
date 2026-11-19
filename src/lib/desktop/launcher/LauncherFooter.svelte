<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import type { Launcher } from "./launcher.svelte"

let { launcher }: { launcher: Launcher } = $props()

const PREFIXES: [string, () => string][] = [
  ["> ", m.launcher_mode_run],
  ["t ", m.launcher_mode_todo],
  ["=", m.launcher_mode_calc],
  [":", m.launcher_mode_emoji],
  ["v ", m.launcher_mode_clip],
  ["timer ", m.launcher_mode_timer],
]

const current = $derived(launcher.current)
</script>

{#snippet key(keys: string, label: string)}
  <span class="flex shrink-0 items-center gap-1 whitespace-nowrap">
    <kbd class="kbd kbd-xs">{keys}</kbd>
    {label}
  </span>
{/snippet}

<footer
  class={[
    "flex h-7 shrink-0 items-center justify-between gap-3 overflow-hidden px-2",
    "text-xs text-base-content/50",
  ]}
>
  {#if launcher.query}
    <div class="flex min-w-0 items-center gap-3">
      {#if current}
        {@render key("↵", launcher.primaryLabel(current))}
      {/if}
      {#if launcher.secondary(current, "admin")}
        {@render key("Shift ↵", m.launcher_key_admin())}
      {/if}
      {#if launcher.secondary(current, "location")}
        {@render key("Ctrl ↵", m.launcher_key_location())}
      {/if}
    </div>
  {:else}
    <div class="flex min-w-0 items-center gap-3">
      {#each PREFIXES as [prefix, label] (prefix)}
        <button
          type="button"
          tabindex="-1"
          class="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap hover:text-base-content"
          onclick={() => launcher.insertPrefix(prefix)}
        >
          <kbd class="kbd kbd-xs">{prefix.trim()}</kbd>
          {label()}
        </button>
      {/each}
    </div>
  {/if}
  {#if launcher.groups.length > 1}
    {@render key("Tab", m.launcher_key_groups())}
  {/if}
</footer>

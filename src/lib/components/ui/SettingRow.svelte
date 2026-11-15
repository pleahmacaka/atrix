<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"

let {
  icon,
  title,
  children,
}: { icon: string; title: string; children?: Snippet } = $props()
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
  <div class="flex min-w-0 flex-1 basis-40 items-center gap-3">
    <span class="grid size-8 shrink-0 place-items-center rounded-field bg-base-content/6">
      <Icon {icon} class="size-4 text-base-content/70" />
    </span>
    <p class="min-w-0 text-sm font-medium">{title}</p>
  </div>
  {#if children}
    <div
      class="control flex min-w-0 items-center justify-end gap-2 sm:shrink-0 max-sm:grow"
    >
      {@render children()}
    </div>
  {/if}
</div>

<style>
  @media (width < 40rem) {
    .control > :global(:is(input, select, textarea, label, .input, .select, .join)) {
      flex: 1 1 12rem;
      min-width: 12rem;
    }
  }
</style>

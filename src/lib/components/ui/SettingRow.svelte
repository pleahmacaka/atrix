<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"

let {
  icon,
  title,
  hint,
  children,
}: { icon: string; title: string; hint?: string; children?: Snippet } = $props()
</script>

<div
  class={[
    "flex items-center gap-4 border-b border-base-300 py-4 last:border-b-0",
    "max-sm:flex-col max-sm:items-stretch",
  ]}
>
  <div class="flex min-w-0 flex-1 items-center gap-3">
    <span class="grid size-8 shrink-0 place-items-center rounded-field bg-base-200">
      <Icon {icon} class="size-4 text-base-content/70" />
    </span>
    <div class="min-w-0">
      <p class="text-sm font-medium">{title}</p>
      {#if hint}
        <p class="mt-0.5 text-xs text-base-content/60">{hint}</p>
      {/if}
    </div>
  </div>
  {@render children?.()}
</div>

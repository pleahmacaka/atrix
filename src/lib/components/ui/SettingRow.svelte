<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"
import { hoverTip } from "./tooltip.ts"

let {
  icon,
  title,
  tip,
  children,
}: { icon?: string; title: string; tip?: string; children?: Snippet } = $props()
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 max-sm:flex-col max-sm:items-stretch">
  <div
    class={[
      "flex min-h-8 min-w-0 flex-1 basis-40 items-center gap-3",
      "max-sm:basis-auto pointer-coarse:select-none",
    ]}
    {@attach hoverTip(() => tip, "bottom-start")}
  >
    {#if icon}
      <Icon {icon} class="size-5 shrink-0" />
    {/if}
    <p class="min-w-0 text-sm font-medium">{title}</p>
  </div>
  {#if children}
    <div
      class="control flex min-w-0 flex-wrap items-center justify-end gap-2 sm:shrink-0 max-sm:justify-start"
      {@attach hoverTip(() => tip, "bottom-end")}
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

<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"

let {
  icon,
  title,
  children,
}: { icon: string; title: string; children?: Snippet } = $props()
</script>

<div
  class={[
    "flex items-center gap-4 py-3",
    "max-sm:flex-col max-sm:items-stretch",
  ]}
>
  <div class="flex min-w-0 flex-1 items-center gap-3">
    <span class="grid size-8 shrink-0 place-items-center rounded-field bg-base-200">
      <Icon {icon} class="size-4 text-base-content/70" />
    </span>
    <p class="min-w-0 text-sm font-medium">{title}</p>
  </div>
  {@render children?.()}
</div>

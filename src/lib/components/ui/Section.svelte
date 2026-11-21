<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"

let {
  icon,
  title,
  actions,
  children,
}: {
  icon?: string
  title?: string
  actions?: Snippet
  children: Snippet
} = $props()
</script>

<section class="flex flex-col gap-2">
  {#if title}
    <header class="flex min-h-8 items-center gap-2 px-1">
      {#if icon}
        <Icon {icon} class="size-4 shrink-0 text-base-content/60" />
      {/if}
      <h3
        class="min-w-0 flex-1 truncate text-sm font-medium text-base-content/70"
        {title}
      >
        {title}
      </h3>
      {@render actions?.()}
    </header>
  {/if}
  <div class="rounded-box border border-base-300 bg-base-100 px-4">
    {@render children()}
  </div>
</section>

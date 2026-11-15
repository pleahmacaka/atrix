<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"
import type { ClassValue } from "svelte/elements"

let {
  icon,
  title,
  class: extra,
  actions,
}: {
  icon?: string
  title: string
  class?: ClassValue
  actions?: Snippet
} = $props()
</script>

<header class={["flex h-12 shrink-0 items-center gap-2 px-4 sm:px-6", extra]}>
  {#if icon}
    <Icon {icon} class="size-4 shrink-0 text-base-content/60" />
  {/if}
  <h1 class="min-w-0 flex-1 truncate text-sm font-semibold" title={title}>{title}</h1>
  {#if actions}
    <div class="flex shrink-0 items-center gap-1">
      {@render actions()}
    </div>
  {/if}
</header>

<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"
import type { ClassValue } from "svelte/elements"
import { fade } from "#lib/pcb/motion.ts"

let {
  icon,
  text,
  title,
  fade: animated = false,
  dashed = false,
  centered = false,
  class: className,
  children,
}: {
  icon: string
  text: string
  title?: string
  fade?: boolean
  dashed?: boolean
  centered?: boolean
  class?: ClassValue
  children?: Snippet
} = $props()

const enter = (node: Element) => (animated ? fade(node) : { duration: 0 })
</script>

<div
  class={[
    "flex flex-col items-center gap-3 py-12 text-center",
    dashed && "rounded-box border border-dashed border-base-300 px-4",
    centered && "size-full min-h-0 flex-1 justify-center px-4",
    className,
  ]}
  in:enter
>
  <Icon {icon} class="size-8 text-base-content/40" />
  {#if title}
    <div class="flex flex-col gap-1">
      <p class="text-sm font-medium">{title}</p>
      <p class="text-sm text-base-content/60">{text}</p>
    </div>
  {:else}
    <p class="text-sm text-base-content/60">{text}</p>
  {/if}
  {@render children?.()}
</div>

<script lang="ts">
import Icon from "@iconify/svelte"
import type { HTMLButtonAttributes } from "svelte/elements"

let {
  icon,
  label,
  selected = false,
  expanded,
  strong = false,
  accent = false,
  badge,
  ...rest
}: Omit<HTMLButtonAttributes, "class" | "type"> & {
  icon: string
  label: string
  badge?: string
  selected?: boolean
  expanded?: boolean
  strong?: boolean
  accent?: boolean
} = $props()
</script>

<button
  type="button"
  class={[
    "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-field px-2",
    "text-start text-sm transition-colors duration-140",
    selected
      ? "bg-primary/8 text-primary"
      : "text-base-content/80 hover:bg-base-content/8 hover:text-base-content",
    strong && "font-medium",
  ]}
  aria-expanded={expanded}
  aria-current={selected ? "page" : undefined}
  {...rest}
>
  <Icon
    {icon}
    class={[
      "size-4 shrink-0",
      selected || accent ? "text-primary" : "text-base-content/40",
    ]}
  />
  <span class="min-w-0 flex-1 truncate">{label}</span>
  {#if badge}
    <span class="badge badge-soft badge-primary badge-xs shrink-0">{badge}</span>
  {/if}
  {#if expanded !== undefined}
    <Icon
      icon="lucide:chevron-right"
      class={[
        "size-4 shrink-0 text-base-content/40 transition-transform duration-140",
        expanded && "rotate-90",
      ]}
    />
  {/if}
</button>

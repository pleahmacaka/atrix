<script lang="ts" module>
export const TOOLBAR = [
  "bg-inset border-base-300 flex min-h-12 shrink-0 items-center gap-2",
  "overflow-x-auto border-b p-2",
]

export const SEGMENTS = "bg-base-300 rounded-field flex h-8 shrink-0 items-center gap-1 p-1"

export const RANGE = "flex h-8 shrink-0 items-center gap-2 px-2 text-xs"
</script>

<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"

let {
  label,
  icon,
  pressed,
  iconOnly = false,
  disabled = false,
  onclick,
  children,
}: {
  label: string
  icon?: string
  pressed?: boolean
  iconOnly?: boolean
  disabled?: boolean
  onclick: () => void
  children?: Snippet
} = $props()

const named = $derived(iconOnly || !!children)
</script>

<button
  type="button"
  class={[
    "rounded-field flex h-6 cursor-pointer items-center gap-1 px-2",
    "text-xs font-medium whitespace-nowrap transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-40",
    pressed
      ? "bg-base-content text-base-100"
      : "text-base-content/60 hover:text-base-content",
  ]}
  aria-pressed={pressed}
  aria-label={named ? label : undefined}
  title={named ? label : undefined}
  {disabled}
  {onclick}
>
  {#if icon}
    <Icon {icon} class="size-4 shrink-0" />
  {/if}
  {#if children}
    {@render children()}
  {:else if !iconOnly}
    {label}
  {/if}
</button>

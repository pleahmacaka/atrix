<script lang="ts">
import Icon from "@iconify/svelte"
import type { ClassValue, HTMLButtonAttributes } from "svelte/elements"

let {
  icon,
  label,
  title = label,
  tone = "ghost",
  size = "sm",
  shape = "square",
  iconClass = "size-4",
  busy = false,
  type = "button",
  class: extra,
  children,
  ref = $bindable(),
  ...rest
}: Omit<HTMLButtonAttributes, "class" | "aria-label"> & {
  icon: string
  label: string
  tone?: "ghost" | "primary" | "error" | "warning" | "plain"
  size?: "xs" | "sm" | "md"
  shape?: "square" | "circle" | "wide"
  iconClass?: ClassValue
  busy?: boolean
  class?: ClassValue
  ref?: HTMLButtonElement
} = $props()
</script>

<button
  bind:this={ref}
  {type}
  class={[
    "btn",
    shape === "square" && "btn-square",
    shape === "circle" && "btn-circle",
    size === "xs" && "btn-xs",
    size === "sm" && "btn-sm",
    tone === "ghost" && "btn-ghost",
    tone === "primary" && "btn-primary",
    tone === "error" && "btn-error",
    tone === "warning" && "btn-ghost text-warning",
    extra,
  ]}
  aria-label={label}
  {title}
  {...rest}
>
  {#if busy}
    <span class="loading loading-spinner loading-xs"></span>
  {:else}
    <Icon {icon} class={iconClass} />
  {/if}
  {@render children?.()}
</button>

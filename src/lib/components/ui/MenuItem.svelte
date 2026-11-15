<script lang="ts">
import Icon from "@iconify/svelte"
import type { Snippet } from "svelte"
import type { ClassValue, HTMLButtonAttributes } from "svelte/elements"

let {
  icon,
  label,
  hint,
  checked,
  selected = false,
  danger = false,
  class: extra,
  trailing,
  ...rest
}: Omit<HTMLButtonAttributes, "class" | "role"> & {
  icon?: string
  label: string
  hint?: string
  checked?: boolean
  selected?: boolean
  danger?: boolean
  class?: ClassValue
  trailing?: Snippet
} = $props()

const look = $derived([
  "flex min-h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-field px-2",
  "text-left text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-40",
  selected
    ? "bg-primary/8 text-primary"
    : "hover:bg-base-content/8 focus-visible:bg-base-content/8",
  danger && "text-error",
  extra,
])
</script>

{#snippet body()}
  {#if icon}
    <Icon {icon} class="size-4 shrink-0 opacity-70" />
  {/if}
  <span class="min-w-0 flex-1 truncate" title={label}>{label}</span>
  {#if hint}
    <kbd class="kbd kbd-xs shrink-0 opacity-60">{hint}</kbd>
  {/if}
  {@render trailing?.()}
  {#if checked !== undefined}
    <Icon icon="lucide:check" class={["size-4 shrink-0", !checked && "invisible"]} />
  {/if}
{/snippet}

{#if checked === undefined}
  <button type="button" role="menuitem" class={look} {...rest}>
    {@render body()}
  </button>
{:else}
  <button
    type="button"
    role="menuitemcheckbox"
    aria-checked={checked}
    class={look}
    {...rest}
  >
    {@render body()}
  </button>
{/if}

<script lang="ts" generics="T extends string">
import Icon from "@iconify/svelte"
import Select from "./Select.svelte"

const INLINE_LIMIT = 3

let {
  items,
  value,
  onpick,
  label,
}: {
  items: { id: T; label: string; icon?: string }[]
  value: T
  onpick: (id: T) => void
  label: string
} = $props()
</script>

{#if items.length > INLINE_LIMIT}
  <Select
    class="w-44 max-sm:w-full"
    {label}
    options={items.map(i => ({ value: i.id, label: i.label, icon: i.icon }))}
    {value}
    onchange={onpick}
  />
{:else}

<div
  class="flex shrink-0 flex-wrap gap-1 rounded-field bg-base-content/6 p-1 max-sm:w-full max-sm:min-w-0 max-sm:shrink"
>
  {#each items as item (item.id)}
    <button
      type="button"
      class={[
        "btn btn-sm flex-nowrap border-0 max-sm:flex-auto",
        value === item.id ? "bg-raised text-primary shadow-sm" : "btn-ghost",
      ]}
      aria-pressed={value === item.id}
      onclick={() => onpick(item.id)}
    >
      {#if item.icon}
        <Icon icon={item.icon} class="size-4 shrink-0" />
      {/if}
      <span class="whitespace-nowrap">{item.label}</span>
    </button>
  {/each}
</div>
{/if}

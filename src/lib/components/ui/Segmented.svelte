<script lang="ts" generics="T extends string">
import Icon from "@iconify/svelte"

let {
  items,
  value,
  onpick,
}: {
  items: { id: T; label: string; icon?: string }[]
  value: T
  onpick: (id: T) => void
} = $props()
</script>

<div
  class="flex shrink-0 flex-wrap gap-1 rounded-field bg-base-content/6 p-1 max-sm:w-full max-sm:min-w-0 max-sm:shrink"
>
  {#each items as item (item.id)}
    <button
      type="button"
      class={[
        "btn btn-sm flex-nowrap border-0 max-sm:min-w-0 max-sm:flex-1",
        value === item.id ? "bg-raised text-primary shadow-sm" : "btn-ghost",
      ]}
      aria-pressed={value === item.id}
      title={item.label}
      onclick={() => onpick(item.id)}
    >
      {#if item.icon}
        <Icon icon={item.icon} class="size-4 shrink-0" />
      {/if}
      <span class="max-sm:min-w-0 max-sm:truncate">{item.label}</span>
    </button>
  {/each}
</div>

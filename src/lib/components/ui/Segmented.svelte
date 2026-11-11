<script lang="ts" generics="T extends string">
import Icon from "@iconify/svelte"

let {
  items,
  value,
  onpick,
}: {
  items: { id: T; label: string; icon: string }[]
  value: T
  onpick: (id: T) => void
} = $props()
</script>

<div class="flex gap-1 rounded-field bg-base-200 p-1">
  {#each items as item (item.id)}
    <button
      type="button"
      class={[
        "btn btn-sm border-0",
        value === item.id ? "bg-base-100 text-primary shadow-sm" : "btn-ghost",
      ]}
      aria-pressed={value === item.id}
      onclick={() => onpick(item.id)}
    >
      <Icon icon={item.icon} class="size-4" />
      {item.label}
    </button>
  {/each}
</div>

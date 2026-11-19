<script lang="ts">
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Item } from "../../items"
import ItemIcon from "../items/ItemIcon.svelte"

const { items, label }: { items: Item[]; label: string } = $props()

const SHOWN = 60

const sorted = $derived(
  [...items].sort(
    (a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name),
  ),
)
</script>

<div class="@container flex size-full min-h-0 flex-col gap-2 p-2">
  <span
    class="shrink-0 truncate px-1 text-xs text-base-content/55"
    title={label}
  >
    {label}
  </span>

  {#if items.length === 0}
    <EmptyState
      icon="lucide:folder-open"
      text={m.files_states_empty()}
      centered
    />
  {:else}
    <ul
      class={[
        "grid min-h-0 grow auto-rows-min grid-cols-3 gap-1 overflow-y-auto",
        "@2xs:grid-cols-4 @sm:grid-cols-5 @md:grid-cols-6 @xl:grid-cols-8",
      ]}
    >
      {#each sorted.slice(0, SHOWN) as child (child.key)}
        <li
          class={[
            "flex min-w-0 flex-col items-center gap-1",
            "rounded-field p-1 text-center",
          ]}
          title={child.name}
        >
          <ItemIcon source={child} rem={3} thumbnail class="size-12" />
          <span
            class="line-clamp-2 w-full text-xs break-all text-base-content/75"
          >
            {child.name}
          </span>
        </li>
      {/each}
    </ul>

    {#if items.length > SHOWN}
      <span class="shrink-0 px-1 text-xs text-base-content/55">
        {m.files_peek_more({ count: items.length - SHOWN })}
      </span>
    {/if}
  {/if}
</div>

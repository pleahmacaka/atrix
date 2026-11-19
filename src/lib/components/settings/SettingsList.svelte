<script lang="ts" generics="T extends string">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  items,
  current,
  onpick,
  menu = false,
}: {
  items: { id: T; label: string; icon: string }[]
  current: T
  onpick: (id: T) => void
  menu?: boolean
} = $props()
</script>

{#if menu}
  <nav class="px-3 pb-3" aria-label={m.settings_menu()}>
    <ul class="flex flex-col rounded-box border border-base-300 bg-base-100 p-1">
      {#each items as tab (tab.id)}
        <li>
          <button
            type="button"
            class={[
              "flex h-12 w-full min-w-0 cursor-pointer items-center gap-3 rounded-field px-3",
              "text-sm transition-colors duration-140 hover:bg-base-content/8 active:bg-base-content/8",
            ]}
            onclick={() => onpick(tab.id)}
          >
            <Icon icon={tab.icon} class="size-5 shrink-0 text-base-content/70" />
            <span class="min-w-0 flex-1 truncate text-start">{tab.label}</span>
            <Icon icon="lucide:chevron-right" class="size-4 shrink-0 text-base-content/40" />
          </button>
        </li>
      {/each}
    </ul>
  </nav>
{:else}
  <nav class="flex flex-col gap-0.5 px-2 pb-2" aria-label={m.settings_menu()}>
    {#each items as tab (tab.id)}
      {@const selected = current === tab.id}
      <button
        type="button"
        class={[
          "flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-field px-2 text-sm",
          "transition-colors duration-140",
          selected ? "bg-primary/8 text-primary" : "text-base-content/75 hover:bg-base-content/8",
        ]}
        aria-current={selected ? "page" : undefined}
        aria-label={tab.label}
        onclick={() => onpick(tab.id)}
      >
        <Icon icon={tab.icon} class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate text-start">{tab.label}</span>
      </button>
    {/each}
  </nav>
{/if}

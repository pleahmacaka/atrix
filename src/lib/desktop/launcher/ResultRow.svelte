<script lang="ts">
import Icon from "@iconify/svelte"
import type { Result } from "#lib/desktop/launcher/core/index.ts"
import type { Launcher } from "./launcher.svelte"

let {
  launcher,
  item,
  index,
}: { launcher: Launcher; item: Result; index: number } = $props()

const active = $derived(index === launcher.active)

const image = $derived(item.icon.startsWith("data:") || item.icon.startsWith("/"))
</script>

<button
  type="button"
  role="option"
  aria-selected={active}
  data-index={index}
  tabindex="-1"
  class={[
    "flex min-h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-field px-2",
    "text-left text-sm",
    active ? "bg-primary/8 text-primary" : "hover:bg-base-content/8",
  ]}
  onpointermove={() => {
    launcher.cursor = index
  }}
  onclick={() => launcher.run(item)}
  oncontextmenu={e => launcher.openMenu(index, e)}
>
  <span class="grid size-5 shrink-0 place-items-center">
    {#if item.kind === "emoji"}
      <span class="text-base leading-none">{item.icon}</span>
    {:else if image}
      <img src={item.icon} alt="" class="size-5 object-contain" />
    {:else}
      <Icon icon={item.icon} class="size-4 opacity-70" />
    {/if}
  </span>
  <span class="min-w-0 flex-1 truncate" title={item.title}>{item.title}</span>
  {#each item.chips ?? [] as chip (chip)}
    <span class="badge badge-ghost badge-sm shrink-0 whitespace-nowrap">{chip}</span>
  {/each}
  {#if item.running}
    <span class="loading loading-spinner loading-xs shrink-0"></span>
  {/if}
  {#if item.subtitle}
    <span
      class="max-w-1/3 min-w-0 truncate text-xs text-base-content/50"
      title={item.subtitle}
    >
      {item.subtitle}
    </span>
  {/if}
  {#if index < 9 && launcher.device.showKeymap}
    <kbd class="kbd kbd-xs shrink-0 opacity-60">Alt {index + 1}</kbd>
  {/if}
</button>

<script lang="ts">
import IconButton from "#lib/components/ui/IconButton.svelte"
import WindowControls from "#lib/components/ui/WindowControls.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Explorer } from "../../store/explorer.svelte"
import ItemIcon from "../items/ItemIcon.svelte"
import { middleClick } from "../middleClick"

let { explorer }: { explorer: Explorer } = $props()
</script>

<header
  class="flex h-10 shrink-0 items-center gap-1 ps-2 pe-1.5 select-none"
  data-tauri-drag-region
>
  <div
    role="tablist"
    aria-label={m.files_tabs_list()}
    class="flex min-w-0 shrink items-center gap-1"
  >
    {#each explorer.tabs as tab, index (tab.id)}
      {@const active = index === explorer.active}
      {@const title = explorer.title(tab)}
      <div
        role="tab"
        tabindex={active ? 0 : -1}
        aria-selected={active}
        {title}
        class={[
          "group flex h-7 w-56 min-w-24 shrink cursor-pointer items-center gap-2",
          "rounded-field ps-2.5 pe-1 text-sm transition-colors duration-140",
          active
            ? "bg-primary/8 text-primary"
            : "text-base-content/70 hover:bg-base-content/8 hover:text-base-content",
        ]}
        onclick={() => (explorer.active = index)}
        onkeydown={e => {
          if (e.key === "Enter" || e.key === " ") {
            explorer.active = index
          }
        }}
        {@attach middleClick(() => explorer.close(index))}
      >
        <ItemIcon source={tab.location} rem={1} class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate">{title}</span>
        <IconButton
          icon="lucide:x"
          label={m.files_tabs_close()}
          size="xs"
          iconClass="size-3.5"
          class={[
            "shrink-0 transition-opacity duration-140",
            !active &&
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          ]}
          onclick={e => {
            e.stopPropagation()
            explorer.close(index)
          }}
        />
      </div>
    {/each}
  </div>

  <IconButton
    icon="lucide:plus"
    label={m.files_tabs_new()}
    class="shrink-0"
    onclick={() => explorer.newTab()}
  />

  <div class="h-full min-w-8 flex-1" data-tauri-drag-region></div>

  <WindowControls />
</header>

<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { SETTINGS_TABS } from "./tabs.ts"

let { row = false }: { row?: boolean } = $props()
</script>

<nav
  class={["flex gap-0.5 px-2 pb-2", row ? "flex-row" : "flex-col"]}
  aria-label={m.settings_menu()}
>
  {#each SETTINGS_TABS as tab (tab.id)}
    <button
      type="button"
      class={[
        "flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-field text-sm",
        row ? "shrink-0 px-3" : "px-2",
        "transition-colors duration-140",
        nav.settingsTab === tab.id
          ? "bg-primary/8 text-primary"
          : "text-base-content/75 hover:bg-base-content/8",
      ]}
      aria-current={nav.settingsTab === tab.id ? "page" : undefined}
      aria-label={tab.label}
      onclick={() => {
        nav.settingsTab = tab.id
      }}
    >
      <Icon icon={tab.icon} class="size-4 shrink-0" />
      <span class={["min-w-0 text-start", row ? "whitespace-nowrap" : "flex-1 truncate"]}>{tab.label}</span>
    </button>
  {/each}
</nav>

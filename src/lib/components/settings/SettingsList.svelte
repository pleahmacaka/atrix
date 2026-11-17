<script lang="ts">
import Icon from "@iconify/svelte"
import { tooltip } from "#lib/components/ui/tooltip.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { SETTINGS_TABS } from "./tabs.ts"

let { rail = false }: { rail?: boolean } = $props()
</script>

<nav
  class={["flex flex-col gap-0.5 pb-2", rail ? "items-center px-1" : "px-2"]}
  aria-label={m.settings_menu()}
>
  {#each SETTINGS_TABS as tab (tab.id)}
    <button
      type="button"
      class={[
        "flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-field text-sm",
        rail ? "w-8 justify-center" : "px-2",
        "transition-colors duration-140",
        nav.settingsTab === tab.id
          ? "bg-primary/8 text-primary"
          : "text-base-content/75 hover:bg-base-content/8",
      ]}
      aria-current={nav.settingsTab === tab.id ? "page" : undefined}
      aria-label={tab.label}
      {@attach tooltip(() => tab.label, () => rail)}
      onclick={() => {
        nav.settingsTab = tab.id
      }}
    >
      <Icon icon={tab.icon} class="size-4 shrink-0" />
      {#if !rail}
        <span class="min-w-0 flex-1 truncate text-start">{tab.label}</span>
      {/if}
    </button>
  {/each}
</nav>

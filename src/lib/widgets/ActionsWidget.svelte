<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { nav, openConversation } from "#lib/store/nav.svelte.ts"
import type { WidgetLeaf } from "./layout.svelte.ts"

let { leaf }: { leaf: WidgetLeaf } = $props()

const icons = $derived(leaf.options.layout === "icons")

const ACTIONS = [
  {
    id: "new",
    label: m.chat_new,
    icon: "lucide:square-pen",
    keys: "Ctrl N",
    run: () => openConversation(null),
  },
  {
    id: "search",
    label: m.chat_search_load,
    icon: "lucide:search",
    keys: "Ctrl K",
    run: () => {
      nav.palette = true
    },
  },
  {
    id: "apps",
    label: m.apps_title,
    icon: "lucide:layout-grid",
    keys: "",
    run: () => {
      nav.page = "apps"
    },
  },
]
</script>

{#if icons}
  <div class="flex items-center gap-1 p-1.5">
    {#each ACTIONS as action (action.id)}
      <button
        type="button"
        class={[
          "btn btn-ghost btn-sm btn-square",
          action.id === "apps" && nav.page === "apps" && "text-primary",
        ]}
        aria-label={action.label()}
        title={action.keys ? `${action.label()} (${action.keys})` : action.label()}
        onclick={action.run}
      >
        <Icon icon={action.icon} class="size-4" />
      </button>
    {/each}
  </div>
{:else}
  <ul class="menu w-full gap-0.5 p-1.5">
    {#each ACTIONS as action (action.id)}
      <li>
        <button
          type="button"
          class={[action.id === "apps" && nav.page === "apps" && "menu-active"]}
          onclick={action.run}
        >
          <Icon icon={action.icon} class="size-4" />
          <span class="min-w-0 flex-1 truncate">{action.label()}</span>
          {#if action.keys}
            <kbd class="kbd kbd-xs opacity-60 @max-3xs:hidden">
              {action.keys}
            </kbd>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}

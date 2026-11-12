<script lang="ts">
import Icon from "@iconify/svelte"
import DeviceList from "#lib/components/devices/DeviceList.svelte"
import HarnessList from "#lib/components/harness/HarnessList.svelte"
import KnowledgeTree from "#lib/components/knowledge/KnowledgeTree.svelte"
import { m } from "#lib/paraglide/messages.js"
import { nav, setSidebar } from "#lib/store/nav.svelte.ts"
import { PAGES } from "#lib/store/pages.ts"
import ConversationList from "./ConversationList.svelte"

let { peek = false }: { peek?: boolean } = $props()

const STEP_REM = 2.25

const index = $derived(PAGES.findIndex(p => p.id === nav.page))

const BLOCK = "rounded-box border border-base-300 bg-base-100"
</script>

<aside
  class={[
    "flex h-full w-64 shrink-0 flex-col gap-2",
    "max-lg:fixed max-lg:inset-y-2 max-lg:left-2 max-lg:z-30 max-lg:h-auto",
  ]}
>
  <div class={["flex min-h-0 flex-1 flex-col overflow-hidden", BLOCK]}>
    <div class="flex h-12 shrink-0 items-center gap-2 ps-4 pe-2">
      <span class="flex-1 font-semibold">Atrix</span>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={peek ? m.shell_pin_sidebar() : m.shell_collapse_sidebar()}
        title="{peek ? m.shell_pin_sidebar() : m.shell_collapse_sidebar()} (Ctrl+B)"
        onclick={() => setSidebar(peek)}
      >
        <Icon
          icon={peek ? "lucide:pin" : "lucide:panel-left-close"}
          class="size-4"
        />
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if nav.page === "agent"}
        <HarnessList />
      {:else if nav.page === "knowledge"}
        <KnowledgeTree />
      {:else if nav.page === "devices"}
        <DeviceList />
      {:else}
        <ConversationList />
      {/if}
    </div>
  </div>
  <nav
    class={["flex shrink-0 items-center p-1", BLOCK]}
    aria-label={m.shell_pages()}
  >
    <div class="relative flex gap-1">
      {#if index >= 0}
        <span
          class={[
            "pointer-events-none absolute inset-y-0 left-0 size-8 rounded-field",
            "bg-primary/10 transition-transform duration-200",
          ]}
          style:transform="translateX({index * STEP_REM}rem)"
        ></span>
      {/if}
      {#each PAGES as page (page.id)}
        <button
          type="button"
          class={[
            "btn btn-ghost btn-sm btn-square relative transition-colors",
            nav.page === page.id && "text-primary hover:bg-transparent",
          ]}
          aria-label={page.label()}
          title={page.label()}
          aria-current={nav.page === page.id ? "page" : undefined}
          onclick={() => {
            nav.page = page.id
          }}
        >
          <Icon icon={page.icon} class="size-4" />
        </button>
      {/each}
    </div>
    <span class="flex-1"></span>
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-square"
      aria-label={m.common_settings()}
      title="{m.common_settings()} (Ctrl+,)"
      onclick={() => {
        nav.settings = true
      }}
    >
      <Icon icon="lucide:settings" class="size-4" />
    </button>
  </nav>
</aside>

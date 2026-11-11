<script lang="ts">
import Icon from "@iconify/svelte"
import HarnessList from "#lib/components/harness/HarnessList.svelte"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav, type Page, setSidebar } from "#lib/store/nav.svelte.ts"
import ConversationList from "./ConversationList.svelte"

let { peek = false }: { peek?: boolean } = $props()

const PAGES: { id: Page; label: string; icon: string }[] = [
  { id: "chat", label: m.shell_page_chat(), icon: "lucide:messages-square" },
  { id: "harness", label: m.common_harnesses(), icon: "lucide:boxes" },
]
</script>

<aside
  class={[
    "flex h-full w-64 shrink-0 flex-col border-r border-base-300 bg-base-200",
    "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-30 max-lg:shadow-xl",
  ]}
>
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
    {#if nav.page === "harness"}
      <HarnessList />
    {:else}
      <ConversationList />
    {/if}
  </div>
  <nav
    class="flex shrink-0 items-center gap-1 border-t border-base-300 p-2"
    aria-label={m.shell_pages()}
  >
    {#each PAGES as page (page.id)}
      <button
        type="button"
        class={[
          "btn btn-ghost btn-sm btn-square",
          nav.page === page.id && "btn-active text-primary",
        ]}
        aria-label={page.label}
        title={page.label}
        aria-current={nav.page === page.id ? "page" : undefined}
        onclick={() => {
          nav.page = page.id
        }}
      >
        <Icon icon={page.icon} class="size-4" />
      </button>
    {/each}
    <span class="flex-1"></span>
    <span
      class="grid size-8 place-items-center"
      title={sync.joined ? m.shell_devices_connected({ count: sync.peers.size }) : m.shell_sync_off()}
    >
      <Icon
        icon={sync.joined ? "lucide:radio-tower" : "lucide:wifi-off"}
        class={[
          "size-4",
          sync.joined ? "text-success" : "text-base-content/40",
        ]}
      />
    </span>
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

<script lang="ts">
import Icon from "@iconify/svelte"
import DatasourceList from "#lib/components/datasource/DatasourceList.svelte"
import DeviceList from "#lib/components/devices/DeviceList.svelte"
import HarnessList from "#lib/components/harness/HarnessList.svelte"
import KnowledgeTree from "#lib/components/knowledge/KnowledgeTree.svelte"
import ConversationList from "#lib/components/shell/ConversationList.svelte"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav, setSidebar } from "#lib/store/nav.svelte.ts"
import type { WidgetLeaf } from "./layout.svelte.ts"

let { leaf: _leaf }: { leaf: WidgetLeaf } = $props()
</script>

<div class="flex h-12 shrink-0 items-center gap-2 ps-4 pe-2">
  <span class="flex-1 font-semibold">Atrix</span>
  <button
    type="button"
    class="btn btn-ghost btn-sm btn-square"
    aria-label={nav.sidebar ? m.shell_collapse_sidebar() : m.shell_pin_sidebar()}
    title="{nav.sidebar ? m.shell_collapse_sidebar() : m.shell_pin_sidebar()} (Ctrl+B)"
    onclick={() => setSidebar(!nav.sidebar)}
  >
    <Icon
      icon={nav.sidebar ? "lucide:panel-left-close" : "lucide:pin"}
      class="size-4"
    />
  </button>
</div>
<div class="min-h-0 flex-1 overflow-y-auto">
  {#if nav.page === "agent"}
    <HarnessList />
  {:else if nav.page === "knowledge"}
    <KnowledgeTree />
  {:else if nav.page === "data"}
    {@const local = hostById(LOCAL)}
    {#if local}
      <DatasourceList host={local} bind:selected={nav.table} />
    {/if}
  {:else if nav.page === "devices"}
    <DeviceList />
  {:else}
    <ConversationList />
  {/if}
</div>

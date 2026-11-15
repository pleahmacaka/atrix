<script lang="ts">
import Icon from "@iconify/svelte"
import UpcomingList from "#lib/components/calendar/UpcomingList.svelte"
import DatasourceList from "#lib/components/datasource/DatasourceList.svelte"
import DeviceList from "#lib/components/devices/DeviceList.svelte"
import HarnessList from "#lib/components/harness/HarnessList.svelte"
import KnowledgeTree from "#lib/components/knowledge/KnowledgeTree.svelte"
import ConversationFilter from "#lib/components/shell/ConversationFilter.svelte"
import ConversationList from "#lib/components/shell/ConversationList.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { PAGES } from "#lib/store/pages.ts"

let { rail = false }: { rail?: boolean } = $props()

const page = $derived(
  (nav.page !== "apps" && PAGES.find(p => p.id === nav.page)) || PAGES[0],
)

const local = $derived(hostById(LOCAL))
</script>

{#if rail}
  <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-none">
    <ConversationList rail />
  </div>
{:else}
  <header class="flex h-12 shrink-0 items-center gap-2 ps-4 pe-2">
    <Icon icon={page.icon} class="size-4 shrink-0 text-base-content/60" />
    <h2 class="min-w-0 flex-1 truncate text-sm font-semibold" title={page.label()}>
      {page.label()}
    </h2>
    {#if page.id === "chat"}
      <ConversationFilter />
    {/if}
  </header>
  <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
    {#if page.id === "chat"}
      <ConversationList />
    {:else if page.id === "agent"}
      <HarnessList />
    {:else if page.id === "knowledge"}
      <KnowledgeTree />
    {:else if page.id === "devices"}
      <DeviceList />
    {:else if !local}
      <EmptyState
        icon="lucide:monitor-off"
        title={m.local_host_none_title()}
        text={m.local_host_none_text()}
      />
    {:else if page.id === "data"}
      <DatasourceList host={local} bind:selected={nav.table} />
    {:else}
      <UpcomingList host={local} />
    {/if}
  </div>
{/if}

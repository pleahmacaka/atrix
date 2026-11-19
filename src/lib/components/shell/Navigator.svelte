<script lang="ts">
import UpcomingList from "#lib/components/calendar/UpcomingList.svelte"
import DatasourceList from "#lib/components/datasource/DatasourceList.svelte"
import DeviceList from "#lib/components/devices/DeviceList.svelte"
import AgentList from "#lib/components/harness/AgentList.svelte"
import KnowledgeTree from "#lib/components/knowledge/KnowledgeTree.svelte"
import SpaceList from "#lib/components/shell/SpaceList.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { hostById, hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { CALENDAR_PAGE, PAGES } from "#lib/store/pages.ts"

let { rail = false }: { rail?: boolean } = $props()

const page = $derived(
  (nav.page !== "apps" &&
    [...PAGES, CALENDAR_PAGE].find(p => p.id === nav.page)) ||
    PAGES.find(p => p.id === "chat") ||
    PAGES[0],
)

const local = $derived(hostById(LOCAL))

const hosts = $derived(hostList().map(h => h.view))
</script>

{#if rail}
  <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-none">
    {#if page.id === "chat"}
      <SpaceList rail />
    {/if}
  </div>
{:else}
  <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
    {#if page.id === "chat"}
      <SpaceList />
    {:else if page.id === "agent"}
      <AgentList />
    {:else if page.id === "knowledge"}
      <KnowledgeTree />
    {:else if page.id === "devices"}
      <DeviceList />
    {:else if page.id === "calendar" && hosts.length > 0}
      <UpcomingList {hosts} />
    {:else if !local}
      <EmptyState
        icon="lucide:monitor-off"
        title={m.local_host_none_title()}
        text={m.local_host_none_text()}
      />
    {:else if page.id === "data"}
      <DatasourceList host={local} bind:selected={nav.table} />
    {/if}
  </div>
{/if}

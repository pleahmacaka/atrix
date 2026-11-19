<script lang="ts">
import UpcomingList from "#lib/components/calendar/UpcomingList.svelte"
import DatasourceList from "#lib/components/datasource/DatasourceList.svelte"
import DeviceList from "#lib/components/devices/DeviceList.svelte"
import AgentList from "#lib/components/harness/AgentList.svelte"
import KnowledgeTree from "#lib/components/knowledge/KnowledgeTree.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { hostById, hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { CALENDAR_PAGE, PAGES } from "#lib/store/pages.ts"
import SpaceList from "./SpaceList.svelte"

let { rail = false }: { rail?: boolean } = $props()

const local = $derived(hostById(LOCAL))

const hosts = $derived(hostList().map(host => host.view))

const page = $derived([...PAGES, CALENDAR_PAGE].find(item => item.id === nav.page)?.id ?? "chat")
</script>

{#if rail}
  <SpaceList rail />
{:else if page === "chat"}
  <SpaceList />
{:else if page === "agent"}
  <AgentList />
{:else if page === "knowledge"}
  <KnowledgeTree />
{:else if page === "devices"}
  <DeviceList />
{:else if page === "calendar"}
  {#if hosts.length > 0}
    <UpcomingList {hosts} />
  {:else if !local}
    <EmptyState
      icon="lucide:monitor-off"
      title={m.local_host_none_title()}
      text={m.local_host_none_text()}
      centered
    />
  {/if}
{:else if local}
  <DatasourceList host={local} bind:selected={nav.table} />
{:else}
  <EmptyState
    icon="lucide:monitor-off"
    title={m.local_host_none_title()}
    text={m.local_host_none_text()}
    centered
  />
{/if}

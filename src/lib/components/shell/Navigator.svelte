<script lang="ts">
import Icon from "@iconify/svelte"
import { groups } from "#lib/chat/groups.svelte.ts"
import UpcomingList from "#lib/components/calendar/UpcomingList.svelte"
import DatasourceList from "#lib/components/datasource/DatasourceList.svelte"
import DeviceList from "#lib/components/devices/DeviceList.svelte"
import AgentList from "#lib/components/harness/AgentList.svelte"
import KnowledgeTree from "#lib/components/knowledge/KnowledgeTree.svelte"
import SettingsList from "#lib/components/settings/SettingsList.svelte"
import ConversationFilter from "#lib/components/shell/ConversationFilter.svelte"
import ConversationList from "#lib/components/shell/ConversationList.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav, openConversation } from "#lib/store/nav.svelte.ts"
import { CALENDAR_PAGE, PAGES, SETTINGS_PAGE } from "#lib/store/pages.ts"

let { rail = false }: { rail?: boolean } = $props()

const page = $derived(
  (nav.page !== "apps" &&
    [...PAGES, CALENDAR_PAGE, SETTINGS_PAGE].find(p => p.id === nav.page)) ||
    PAGES.find(p => p.id === "chat") ||
    PAGES[0],
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
      <IconButton
        icon="lucide:users"
        label={m.group_new()}
        onclick={async () => openConversation({ kind: "group", id: await groups.create() })}
      />
      <ConversationFilter />
    {/if}
  </header>
  <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
    {#if page.id === "settings"}
      <SettingsList />
    {:else if page.id === "chat"}
      <ConversationList />
    {:else if page.id === "agent"}
      <AgentList />
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

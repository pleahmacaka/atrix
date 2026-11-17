<script lang="ts">
import AppsHome from "#lib/components/apps/AppsHome.svelte"
import CalendarView from "#lib/components/calendar/CalendarView.svelte"
import TableView from "#lib/components/datasource/TableView.svelte"
import DevicesView from "#lib/components/devices/DevicesView.svelte"
import AgentEditor from "#lib/components/harness/AgentEditor.svelte"
import PromptEditor from "#lib/components/harness/PromptEditor.svelte"
import KnowledgeView from "#lib/components/knowledge/KnowledgeView.svelte"
import SettingsView from "#lib/components/settings/SettingsView.svelte"
import FindBar from "#lib/components/shell/FindBar.svelte"
import PaneNode from "#lib/components/shell/PaneNode.svelte"
import TitleBar from "#lib/components/shell/TitleBar.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"

const local = $derived(hostById(LOCAL))
</script>

{#snippet noHost()}
  <EmptyState
    icon="lucide:monitor-off"
    title={m.local_host_none_title()}
    text={m.local_host_none_text()}
    centered
  />
{/snippet}

<section
  class="island @container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
  aria-label={m.shell_workspace()}
>
  <FindBar />
  <TitleBar />
  {#if nav.page === "chat"}
    <div
      class="flex min-h-0 min-w-0 flex-1"
      bind:clientWidth={panes.width}
      bind:clientHeight={panes.height}
    >
      <PaneNode node={panes.root} />
    </div>
  {:else if nav.page === "settings"}
    <SettingsView />
  {:else if nav.page === "agent"}
    {#if nav.agent?.startsWith("prompt:")}
      <PromptEditor />
    {:else if nav.agent}
      <AgentEditor />
    {:else}
      <EmptyState
        centered
        icon="lucide:contact-round"
        title={m.agents_pick_title()}
        text={m.agents_pick_text()}
      />
    {/if}
  {:else if nav.page === "knowledge"}
    <KnowledgeView />
  {:else if nav.page === "apps"}
    <AppsHome />
  {:else if nav.page === "calendar"}
    {#if local}
      <CalendarView host={local} />
    {:else}
      {@render noHost()}
    {/if}
  {:else if nav.page === "data"}
    {#if !local}
      {@render noHost()}
    {:else if nav.table}
      {#key `${nav.table.name}/${nav.table.table}`}
        <TableView host={local} name={nav.table.name} table={nav.table.table} />
      {/key}
    {:else}
      <EmptyState
        icon="lucide:database"
        title={m.ds_select_table_title()}
        text={m.ds_select_table()}
        centered
      />
    {/if}
  {:else}
    <DevicesView />
  {/if}
</section>

<script lang="ts">
import AppsHome from "#lib/components/apps/AppsHome.svelte"
import TableView from "#lib/components/datasource/TableView.svelte"
import DevicesView from "#lib/components/devices/DevicesView.svelte"
import HarnessView from "#lib/components/harness/HarnessView.svelte"
import KnowledgeView from "#lib/components/knowledge/KnowledgeView.svelte"
import FindBar from "#lib/components/shell/FindBar.svelte"
import PaneNode from "#lib/components/shell/PaneNode.svelte"
import TitleBar from "#lib/components/shell/TitleBar.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import type { WidgetLeaf } from "./layout.svelte.ts"

let { leaf: _leaf }: { leaf: WidgetLeaf } = $props()
</script>

<FindBar />
<TitleBar />
{#if nav.page === "chat"}
  <PaneNode node={panes.root} />
{:else if nav.page === "agent"}
  <HarnessView />
{:else if nav.page === "knowledge"}
  <KnowledgeView />
{:else if nav.page === "apps"}
  <AppsHome />
{:else if nav.page === "data"}
  {@const local = hostById(LOCAL)}
  {#if local && nav.table}
    {#key `${nav.table.name}/${nav.table.table}`}
      <TableView host={local} name={nav.table.name} table={nav.table.table} />
    {/key}
  {:else}
    <EmptyState icon="lucide:database" text={m.ds_select_table()} />
  {/if}
{:else}
  <DevicesView />
{/if}

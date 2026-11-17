<script lang="ts">
import UpcomingList from "#lib/components/calendar/UpcomingList.svelte"
import DatasourceList from "#lib/components/datasource/DatasourceList.svelte"
import DeviceList from "#lib/components/devices/DeviceList.svelte"
import GitPanel from "#lib/components/git/GitPanel.svelte"
import AgentList from "#lib/components/harness/AgentList.svelte"
import KnowledgeTree from "#lib/components/knowledge/KnowledgeTree.svelte"
import SettingsList from "#lib/components/settings/SettingsList.svelte"
import ConversationList from "#lib/components/shell/ConversationList.svelte"
import TerminalPanel from "#lib/components/terminal/TerminalPanel.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { side } from "#lib/git/side.svelte.ts"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { nav } from "#lib/store/nav.svelte.ts"
import { CALENDAR_PAGE, PAGES, SETTINGS_PAGE } from "#lib/store/pages.ts"
import { panes } from "#lib/store/panes.svelte.ts"

let { rail = false }: { rail?: boolean } = $props()

const page = $derived(
  (nav.page !== "apps" &&
    [...PAGES, CALENDAR_PAGE, SETTINGS_PAGE].find(p => p.id === nav.page)) ||
    PAGES.find(p => p.id === "chat") ||
    PAGES[0],
)

const local = $derived(hostById(LOCAL))

const session = $derived(
  panes.active.current?.kind === "session" ? panes.active.current : null,
)

const sessionHost = $derived(session ? hostById(session.host) : undefined)

const cwd = $derived(session ? sessionHost?.views[session.id]?.cwd : undefined)
</script>

{#if rail}
  <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-none">
    {#if page.id === "settings"}
      <SettingsList rail />
    {:else if page.id === "chat"}
      <ConversationList rail />
    {/if}
  </div>
{:else}
  <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
    {#if desktop && side.terminal}
      <div
        class={[
          "flex h-full flex-col",
          (page.id !== "chat" || side.tool !== "terminal") && "hidden",
        ]}
      >
        <TerminalPanel cwd={session?.host === LOCAL ? (cwd ?? "") : ""} />
      </div>
    {/if}
    {#if page.id === "settings"}
      <SettingsList />
    {:else if page.id === "chat"}
      {#if side.tool === "git" && sessionHost && cwd}
        <GitPanel host={sessionHost} {cwd} />
      {:else if side.tool === "git"}
        <EmptyState
          icon="lucide:git-branch"
          title={m.git_none_title()}
          text={m.git_none_text()}
        />
      {:else if side.tool !== "terminal"}
        <ConversationList />
      {/if}
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

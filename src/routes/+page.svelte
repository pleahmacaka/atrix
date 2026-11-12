<script lang="ts">
import DevicesView from "#lib/components/devices/DevicesView.svelte"
import HarnessView from "#lib/components/harness/HarnessView.svelte"
import KnowledgeView from "#lib/components/knowledge/KnowledgeView.svelte"
import SettingsSheet from "#lib/components/settings/SettingsSheet.svelte"
import FindBar from "#lib/components/shell/FindBar.svelte"
import Palette from "#lib/components/shell/Palette.svelte"
import PaneNode from "#lib/components/shell/PaneNode.svelte"
import Sidebar from "#lib/components/shell/Sidebar.svelte"
import TitleBar from "#lib/components/shell/TitleBar.svelte"
import ContextMenu from "#lib/components/ui/ContextMenu.svelte"
import { m } from "#lib/paraglide/messages.js"
import { handleContextMenu } from "#lib/store/contextMenu.svelte.ts"
import { nav, setSidebar } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import { handleShortcut } from "#lib/store/shortcuts.ts"
</script>

<svelte:window onkeydown={handleShortcut} oncontextmenu={handleContextMenu} />

<div class="flex h-dvh gap-2 bg-base-200 p-2">
  {#if nav.sidebar}
    <Sidebar />
    <button
      type="button"
      class="fixed inset-0 z-20 cursor-default bg-black/40 lg:hidden"
      aria-label={m.shell_close_sidebar()}
      onclick={() => setSidebar(false)}
    ></button>
  {:else if nav.peek}
    <div
      role="presentation"
      class="fixed inset-y-0 left-0 z-40 flex p-2"
      onpointerleave={() => {
        nav.peek = false
      }}
    >
      <Sidebar peek />
    </div>
  {/if}
  <main
    class={[
      "relative flex min-w-0 flex-1 flex-col overflow-hidden",
      "rounded-box border border-base-300 bg-base-100",
    ]}
  >
    <FindBar />
    <TitleBar />
    {#if nav.page === "chat"}
      <PaneNode node={panes.root} />
    {:else if nav.page === "agent"}
      <HarnessView />
    {:else if nav.page === "knowledge"}
      <KnowledgeView />
    {:else}
      <DevicesView />
    {/if}
  </main>
</div>

<Palette />
<ContextMenu />
<SettingsSheet />

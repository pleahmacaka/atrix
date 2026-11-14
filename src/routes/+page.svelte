<script lang="ts">
import { MediaQuery } from "svelte/reactivity"
import SettingsSheet from "#lib/components/settings/SettingsSheet.svelte"
import Palette from "#lib/components/shell/Palette.svelte"
import ContextMenu from "#lib/components/ui/ContextMenu.svelte"
import { m } from "#lib/paraglide/messages.js"
import { handleContextMenu } from "#lib/store/contextMenu.svelte.ts"
import { nav, setSidebar } from "#lib/store/nav.svelte.ts"
import { handleShortcut } from "#lib/store/shortcuts.ts"
import EditBar from "#lib/widgets/EditBar.svelte"
import LayoutView from "#lib/widgets/LayoutView.svelte"
import { layout } from "#lib/widgets/layout.svelte.ts"
import Widget from "#lib/widgets/Widget.svelte"

const wide = new MediaQuery("(min-width: 64rem)")

const workspace = $derived(layout.widgets.find(w => w.type === "workspace"))

const others = $derived(
  layout.widgets.filter(w => w.type !== "workspace" && !w.hidden),
)

const docked = $derived(wide.current && nav.sidebar)

const overlay = $derived(!docked && (nav.sidebar || nav.peek))
</script>

<svelte:window onkeydown={handleShortcut} oncontextmenu={handleContextMenu} />

<div class="flex h-dvh bg-base-200 p-2">
  {#if docked}
    <LayoutView node={layout.root} />
  {:else if workspace}
    <Widget leaf={workspace} />
  {/if}
</div>

{#if overlay}
  {#if nav.sidebar}
    <button
      type="button"
      class="fixed inset-0 z-20 cursor-default bg-black/40"
      aria-label={m.shell_close_sidebar()}
      onclick={() => setSidebar(false)}
    ></button>
  {/if}
  <div
    role="presentation"
    class="fixed inset-y-2 left-2 z-30 flex w-64 flex-col gap-2"
    onpointerleave={() => {
      nav.peek = false
    }}
  >
    {#each others as leaf (leaf.id)}
      <Widget {leaf} />
    {/each}
  </div>
{/if}

<EditBar />
<Palette />
<ContextMenu />
<SettingsSheet />

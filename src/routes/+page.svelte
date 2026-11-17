<script lang="ts">
import { tick } from "svelte"
import CallDock from "#lib/components/chat/CallDock.svelte"
import Palette from "#lib/components/shell/Palette.svelte"
import Sidebar from "#lib/components/shell/Sidebar.svelte"
import Workspace from "#lib/components/shell/Workspace.svelte"
import ContextMenu from "#lib/components/ui/ContextMenu.svelte"
import { trackPointer } from "#lib/components/ui/pointer.ts"
import { m } from "#lib/paraglide/messages.js"
import { handleContextMenu } from "#lib/store/contextMenu.svelte.ts"
import { RAIL_REM, shell } from "#lib/store/shell.svelte.ts"
import { handleShortcut } from "#lib/store/shortcuts.ts"

const FOCUSABLE =
  "button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex='-1'])"

const keydown = (e: KeyboardEvent) => {
  handleShortcut(e)

  if (shell.overlay && e.key === "Escape" && !e.defaultPrevented) {
    shell.closeDrawer()
  }
}

const focusDrawer = (node: HTMLElement) => {
  const first = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
    e => !e.closest("[inert]"),
  )

  ;(first ?? node).focus()

  return () => {
    tick().then(() =>
      document.querySelector<HTMLElement>("[data-sidebar-trigger]")?.focus(),
    )
  }
}

const resize = (e: PointerEvent & { currentTarget: HTMLElement }) => {
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  const left = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0

  trackPointer(e, p => shell.resize((p.clientX - left) / rem))
}
</script>

<svelte:window onkeydown={keydown} oncontextmenu={handleContextMenu} />

<div class="window-frame flex h-dvh gap-2 bg-base-200 p-2" data-frame data-tauri-drag-region>
  {#if shell.docked}
    <div
      class="flex min-h-0 shrink-0 transition-width duration-140"
      style:width="{shell.rail ? RAIL_REM : shell.width}rem"
    >
      <Sidebar rail={shell.rail} />
    </div>
    {#if !shell.rail}
      <button
        type="button"
        class={[
          "relative -mx-1.5 w-1 shrink-0 cursor-col-resize rounded-full",
          "transition-colors duration-140 hover:bg-primary/60 active:bg-primary",
        ]}
        aria-label={m.shell_resize_pane()}
        onpointerdown={resize}
      >
        <span class="absolute inset-y-0 -inset-x-1.5"></span>
      </button>
    {/if}
  {/if}
  <Workspace />
</div>

{#if shell.overlay}
  <button
    type="button"
    class="fixed inset-0 z-20 cursor-default bg-black/40"
    aria-label={m.shell_close_sidebar()}
    onclick={shell.closeDrawer}
  ></button>
  <div
    role="dialog"
    tabindex="-1"
    aria-label={m.shell_sidebar()}
    class={[
      "fixed inset-y-2 left-2 z-30 flex w-72 max-w-viewport flex-col p-2",
      "rounded-box border border-base-300 bg-raised shadow-lg",
    ]}
    {@attach focusDrawer}
  >
    <Sidebar />
  </div>
{/if}

<Palette />
<ContextMenu />
<CallDock />

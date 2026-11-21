<script lang="ts">
import { tick } from "svelte"
import { fade, fly } from "svelte/transition"
import CallDock from "#lib/components/chat/CallDock.svelte"
import SelectionReply from "#lib/components/chat/SelectionReply.svelte"
import SettingsDialog from "#lib/components/settings/SettingsDialog.svelte"
import Palette from "#lib/components/shell/Palette.svelte"
import Sidebar from "#lib/components/shell/Sidebar.svelte"
import Workspace from "#lib/components/shell/Workspace.svelte"
import ContextMenu from "#lib/components/ui/ContextMenu.svelte"
import { trackPointer } from "#lib/components/ui/pointer.ts"
import { logFailure } from "#lib/logging.ts"
import { floating, floatNew, SIDEBAR } from "#lib/p2p/float.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { handleContextMenu } from "#lib/store/contextMenu.svelte.ts"
import { onNewChatFloat } from "#lib/store/drag.ts"
import { nav } from "#lib/store/nav.svelte.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { RAIL_REM, shell } from "#lib/store/shell.svelte.ts"
import { handleShortcut } from "#lib/store/shortcuts.ts"

const FOCUSABLE =
  "button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex='-1'])"

$effect(() => {
  void [nav.agent, nav.doc, nav.table, nav.harness]

  if (shell.narrow) {
    shell.drawer = false
  }
})

if (desktop) {
  onNewChatFloat(() => {
    floatNew(m.chat_new()).catch(e => logFailure("float new chat", e))
  })
}

const keydown = (e: KeyboardEvent) => {
  handleShortcut(e)

  if (shell.overlay && e.key === "Escape" && !e.defaultPrevented) {
    shell.closeDrawer()
  }
}

const closeOutside = (e: PointerEvent) => {
  const target = e.target instanceof Element ? e.target : null

  if (
    shell.overlay &&
    !target?.closest("[data-sidebar-drawer], [data-sidebar-trigger], :popover-open")
  ) {
    shell.closeDrawer()
  }
}

const focusDrawer = (node: HTMLElement) => {
  if (shell.peek) {
    return
  }

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

const docked = $derived(!floating.has(SIDEBAR))

const resize = (e: PointerEvent & { currentTarget: HTMLElement }) => {
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  const left = e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0

  trackPointer(e, p => shell.resize((p.clientX - left) / rem))
}
</script>

<svelte:window
  onkeydown={keydown}
  onpointerdown={closeOutside}
  oncontextmenu={handleContextMenu}
/>

<div class="window-frame flex h-dvh flex-col bg-base-200" data-frame>
<div class="flex min-h-0 flex-1 gap-2 p-2 max-sm:gap-0 max-sm:p-1" data-shell>
  {#if docked && (!shell.collapsed || shell.compact)}
    <div
      class="flex min-h-0 shrink-0 transition-width duration-140"
      style:width="{shell.collapsed ? RAIL_REM : shell.width}rem"
    >
      <Sidebar rail={shell.collapsed} />
    </div>
    {#if !shell.collapsed}
      <button
        type="button"
        class={[
          "relative -mx-1.5 my-2 w-1 shrink-0 cursor-col-resize rounded-full",
          "transition-colors duration-140 hover:bg-primary/60 active:bg-primary",
        ]}
        aria-label={m.shell_resize_pane()}
        data-resize
        onpointerdown={resize}
        ondblclick={shell.reset}
      >
        <span class="absolute inset-y-0 -inset-x-1.5"></span>
      </button>
    {/if}
  {:else if docked && !shell.drawer}
    <div
      class="fixed bottom-0 left-0 z-20 w-2"
      style:top="{225 / settings.scale}rem"
      aria-hidden="true"
      onpointerenter={shell.openDrawer}
    ></div>
  {/if}
  <Workspace />
</div>
</div>

{#if docked && shell.overlay && shell.narrow}
  <div
    class="fixed inset-0 z-30 bg-base-100/50 backdrop-blur-sm"
    aria-hidden="true"
    transition:fade={{ duration: 140 }}
  ></div>
{/if}
{#if docked && shell.overlay}
  <div
    role="dialog"
    tabindex="-1"
    aria-label={m.shell_sidebar()}
    class="fixed bottom-0 z-30 flex max-w-viewport px-2 pb-2 max-sm:max-w-5/6 max-sm:px-0 max-sm:pb-0"
    style:top={shell.narrow ? "0" : `${225 / settings.scale}rem`}
    style:left="{shell.compact ? RAIL_REM + 0.5 : 0}rem"
    style:width="{shell.width + 1}rem"
    data-sidebar-drawer
    transition:fly={{ x: -16, duration: 160 }}
    onpointerleave={shell.leaveDrawer}
    {@attach focusDrawer}
  >
    <Sidebar />
  </div>
{/if}

<Palette />
<SettingsDialog />
<ContextMenu />
<SelectionReply />
<CallDock />

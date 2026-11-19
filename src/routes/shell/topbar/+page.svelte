<script lang="ts">
  import { listen } from "@tauri-apps/api/event"
  import { getCurrentWindow } from "@tauri-apps/api/window"
  import { untrack } from "svelte"
  import { ensureDevice } from "#lib/desktop/device.js"
  import {
    BarZones,
    DockLayout,
    dockAwake,
    TrayStatus,
    watchPopovers,
  } from "#lib/desktop/dock/index.js"
  import { rem } from "#lib/desktop/dock/rem.svelte.js"
  import { barMenu } from "#lib/desktop/dock/tray/menus.js"
  import { watchEdit } from "#lib/desktop/edit/index.js"
  import * as native from "#lib/desktop/native/index.js"
  import { type DeviceSettings, onDevice } from "#lib/desktop/settings/index.ts"
  import { m } from "#lib/paraglide/messages.js"
  import { contextMenu } from "#lib/store/contextMenu.svelte.ts"

  const layout = new DockLayout("topbar")

  const status = new TrayStatus(() => layout.device.showNotifications && dockAwake.visible)

  let panelOpen = $state(false)

  const on = $derived(layout.device.features.dock && layout.device.topBar)

  const sync = async (next: DeviceSettings) => {
    layout.device = next

    if (!next.features.dock || !next.topBar) {
      await native.releaseTopbar().catch(() => undefined)

      return
    }

    await layout.applyLayout()
    await native.showWindow("topbar").catch(() => undefined)
  }

  const togglePanel = () => native.toggleWindow("panel").catch(() => undefined)

  $effect(() => {
    const box = layout.menuBox

    native
      .extendTopbar(0, box ? [box.left, box.top, box.right, box.bottom] : null)
      .catch(() => undefined)
  })

  $effect(() => {
    ensureDevice().then(sync)

    const stops = [
      onDevice(d => {
        void sync(d)
      }),
      native.onWindowShown("panel", () => {
        panelOpen = true
      }),
      native.onWindowHiding("panel", () => {
        panelOpen = false
      }),
      native.onDockFullscreen(fullscreen => {
        if (fullscreen) {
          layout.closeMenus()
        }
      }),
      listen("atrix-close-menus", () => {
        layout.closeLocal()
      }),
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          layout.closeMenus()
        }
      }),
    ]
    const stopPopovers = watchPopovers(layout.claim)
    const stopEditWatch = watchEdit()

    return () => {
      stopPopovers()
      stopEditWatch()

      for (const stop of stops) {
        stop.then(fn => fn())
      }
    }
  })

  $effect(() => {
    void layout.staticKey

    if (on) {
      untrack(layout.applyLayout)
    }
  })
</script>

{#if on}
  <nav
    class={[
      "flex items-center gap-2 border-b border-base-300 px-2 select-none",
      layout.device.dockIslands ? "bg-base-200" : "bg-base-100",
    ]}
    style:height={rem(layout.barHeight)}
    aria-label={m.dock_top_bar()}
    oncontextmenu={e => contextMenu.show(e, barMenu(layout.device.showSettingsButton))}
  >
    <BarZones {layout} {status} {panelOpen} onclock={togglePanel} />
  </nav>
{/if}

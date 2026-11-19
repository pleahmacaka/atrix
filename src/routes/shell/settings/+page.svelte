<script lang="ts">
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { tick } from "svelte"
import AppearanceTab from "#lib/components/settings/AppearanceTab.svelte"
import DesktopComponents from "#lib/components/settings/DesktopComponents.svelte"
import DesktopDock from "#lib/components/settings/DesktopDock.svelte"
import DesktopLauncher from "#lib/components/settings/DesktopLauncher.svelte"
import DesktopTray from "#lib/components/settings/DesktopTray.svelte"
import { desktopSettings, windows } from "#lib/components/settings/desktop.svelte.ts"
import { DESKTOP_PAGES, type DesktopPage } from "#lib/components/settings/desktopSettings.ts"
import SettingsList from "#lib/components/settings/SettingsList.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { startTitleTips } from "#lib/components/ui/tooltip.ts"
import WindowControls from "#lib/components/ui/WindowControls.svelte"
import { m } from "#lib/paraglide/messages.js"
import { startAppearance } from "#lib/store/appearance.svelte.ts"

const OPENED = "desktop-settings:open"

const SHARED: DesktopPage[] = ["general", "appearance"]

const DOCKED: DesktopPage[] = ["topbar", "tray"]

const appWindow = getCurrentWindow()

let body = $state<HTMLElement>()

const device = $derived(desktopSettings.device)

const launcher = $derived(desktopSettings.launcher)

const shell = $derived(windows && desktopSettings.components?.shell === true && device !== null && launcher !== null)

const pages = $derived(
  DESKTOP_PAGES.filter(
    p => SHARED.includes(p.id) || (shell && (device?.features.dock || !DOCKED.includes(p.id))),
  ),
)

const current = $derived(pages.find(p => p.id === desktopSettings.page) ?? pages[0])

const take = () =>
  invoke<string | null>("desktop_settings_section")
    .then(desktopSettings.open)
    .catch(() => undefined)

$effect(() => {
  appWindow.setTitle(m.desktop_settings_title()).catch(() => undefined)
  desktopSettings.load()
  take()

  const stop = listen(OPENED, take)

  return () => {
    stop.then(unlisten => unlisten())
  }
})

$effect(() => desktopSettings.watch())

$effect(() => startAppearance())

$effect(() => startTitleTips())

$effect(() => {
  const id = desktopSettings.focus

  if (!id || current.id !== desktopSettings.page) {
    return
  }

  tick().then(() => {
    body?.querySelector(`[data-desktop-section="${id}"]`)?.scrollIntoView({ block: "start" })
    desktopSettings.focus = null
  })
})
</script>

<div class="window-frame flex h-dvh flex-col bg-base-200" data-frame>
  <header class="flex h-10 shrink-0 items-center gap-1 ps-2 pe-1.5 select-none" data-tauri-drag-region>
    <h1 class="pointer-events-none min-w-0 flex-1 truncate ps-1 text-sm font-medium">
      {m.desktop_settings_title()}
    </h1>
    <WindowControls />
  </header>
  <div class="flex min-h-0 flex-1 gap-2 px-2 pb-2">
    <aside class="flex w-48 shrink-0 flex-col overflow-y-auto rounded-box border border-base-300 bg-base-100 pt-2">
      <SettingsList items={pages} current={current.id} onpick={id => (desktopSettings.page = id)} />
    </aside>
    {#key current.id}
      <section
        bind:this={body}
        class="@container flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto p-1"
        aria-label={current.label}
      >
        <ErrorAlert message={desktopSettings.saving.failure} />
        {#if current.id === "general"}
          <DesktopComponents />
        {:else if current.id === "appearance"}
          <AppearanceTab client={false} />
        {:else if device && launcher}
          {#if current.id === "dock" || current.id === "topbar" || current.id === "panel"}
            <DesktopDock {device} page={current.id} />
          {:else if current.id === "launcher"}
            <DesktopLauncher {device} {launcher} />
          {:else}
            <DesktopTray {device} />
          {/if}
        {/if}
      </section>
    {/key}
  </div>
</div>

<script lang="ts">
import { loadProfile, onDevice, onProfile } from "@atrix/settings"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { ensureDevice } from "#lib/desktop/device.js"
import { watchEdit } from "#lib/desktop/edit/index.js"
import { ATRIX_ITEMS, type AtrixItems } from "#lib/desktop/launcher/atrix.js"
import {
  contextmenu,
  keydown,
  Launcher,
  LauncherFooter,
  loadFrecency,
  pointerdown,
  ResultList,
  SearchBox,
  subscribeTimers,
} from "#lib/desktop/launcher/index.js"
import { onAppsChanged, onPinsChanged } from "#lib/desktop/native/apps.js"
import { onWindowShown } from "#lib/desktop/native/windows.js"

const launcher = new Launcher()

$effect(() => {
  ensureDevice()
    .then(d => {
      launcher.device = d
    })
    .catch(() => undefined)
  loadFrecency().then(() => {
    launcher.usage += 1
  })
  loadProfile().then(p => {
    launcher.profile = p
  })
  launcher.refresh()

  const stopTimers = subscribeTimers(items => {
    launcher.timers = items
  })
  const stopEditWatch = watchEdit()

  const stops = [
    onProfile(p => {
      launcher.profile = p
    }),
    onDevice(d => {
      launcher.device = d
    }),
    onWindowShown("launcher", () => {
      launcher.setQuery("")
      launcher.usage += 1
      launcher.reopen()
      launcher.input?.focus()
    }),
    onAppsChanged(() => launcher.refreshApps()),
    onPinsChanged(() => launcher.refreshApps()),
    listen<string>("launcher-query", e => {
      launcher.setQuery(e.payload)
      launcher.input?.focus()
    }),
    getCurrentWebviewWindow().listen<AtrixItems>(ATRIX_ITEMS, e => {
      launcher.atrix = e.payload
    }),
  ]

  return () => {
    stopTimers()
    stopEditWatch()

    for (const stop of stops) {
      stop.then(fn => fn())
    }
  }
})

$effect(() => {
  launcher.input?.focus()
})

$effect(() => {
  if (launcher.clipMode) {
    launcher.refreshClips()
  }
})
</script>

<svelte:window
  onkeydown={e => keydown(launcher, e)}
  onpointerdowncapture={pointerdown}
  onfocus={() => launcher.input?.focus()}
/>

<main
  class="flex min-h-0 flex-1 select-none flex-col p-3"
  oncontextmenu={e => contextmenu(launcher, e)}
>
  <section
    data-launcher
    class="popover-box flex min-h-0 flex-1 flex-col gap-1 p-1.5"
  >
    <SearchBox {launcher} />
    <ResultList {launcher} />
    {#if launcher.device.showKeymap}
      <LauncherFooter {launcher} />
    {/if}
  </section>
</main>

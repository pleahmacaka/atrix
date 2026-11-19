<script lang="ts">
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import type { Snippet } from "svelte"
import ContextMenu from "#lib/components/ui/ContextMenu.svelte"
import { fadeShell } from "#lib/desktop/motion.ts"
import { windowReady } from "#lib/desktop/native/windows.ts"
import { followSettings } from "#lib/desktop/theme.ts"
import { paintSurface, paintTheme } from "#lib/store/appearance.svelte.ts"
import { handleContextMenu } from "#lib/store/contextMenu.svelte.ts"
import { page } from "$app/state"

let { children }: { children: Snippet } = $props()

let shell = $state<HTMLDivElement>()

const appWindow = getCurrentWindow()

const framed = page.data.framed === true

document.documentElement.dataset.overlay = ""

$effect(() => {
  paintTheme()
})

$effect(() => {
  if (!framed) {
    paintSurface()
  }
})

$effect(() => {
  windowReady().catch(() => undefined)

  if (framed && !Reflect.get(window, "__ATRIX_HEADLESS__")) {
    appWindow.show().then(() => appWindow.setFocus())
  }
})

$effect(() => {
  const el = shell

  if (!el || framed) {
    return
  }

  fadeShell(el, false)

  const fadeOn = (event: string, out: boolean) =>
    listen<string>(event, e => {
      if (e.payload === appWindow.label) {
        fadeShell(el, out)
      }
    })

  const stops = [fadeOn("window-shown", false), fadeOn("window-hiding", true)]

  return () => {
    for (const stop of stops) {
      stop.then(unlisten => unlisten())
    }
  }
})
</script>

<svelte:window oncontextmenu={handleContextMenu} onstorage={followSettings} />

<div bind:this={shell} class="relative isolate flex h-dvh flex-col">
  {@render children()}
</div>

<ContextMenu />

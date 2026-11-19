<script lang="ts">
  import { setupI18n } from "@atrix/i18n"
  import {
    type Appearance,
    defaultAppearance,
    loadDevice,
    loadProfile,
    onDevice,
    onProfile,
    type WindowSurface,
  } from "@atrix/settings"
  import { Aura, GlobalContextMenu } from "@atrix/ui"
  import { logoSvg } from "@atrix/ui/logo"
  import { getCurrentWindow } from "@tauri-apps/api/window"
  import { fadeShell } from "#lib/desktop/motion.js"
  import {
    onWindowHiding,
    onWindowShown,
    type WindowLabel,
    windowReady,
  } from "#lib/desktop/native/index.js"
  import { applyAppearance } from "#lib/desktop/theme.js"
  import { page } from "$app/state"
  import "@atrix/markdown/markdown.css"

  let { children } = $props()

  const WINDOWS: Record<string, WindowSurface> = {
    launcher: "launcher",
    panel: "panel",
    settings: "settings",
    notices: "notices",
    files: "files",
    terminal: "terminal",
  }

  const favicon = `data:image/svg+xml,${encodeURIComponent(logoSvg())}`

  const surface = WINDOWS[page.route.id?.split("/")[2] ?? ""]

  document.documentElement.dataset.surface = "window"

  if (surface) {
    document.documentElement.dataset.window = surface
  }

  const appWindow = getCurrentWindow()
  const windowLabel = appWindow.label as WindowLabel
  const framed = page.data.framed === true

  $effect(() => {
    windowReady().catch(() => undefined)
  })

  $effect(() => {
    if (framed && !Reflect.get(window, "__ATRIX_HEADLESS__")) {
      appWindow.show().then(() => appWindow.setFocus())
    }
  })

  $effect(() => {
    let current: Appearance = defaultAppearance
    const scheme = window.matchMedia("(prefers-color-scheme: dark)")

    const apply = (appearance: Appearance) => {
      current = appearance
      applyAppearance(current, { restingShadow: framed })
    }

    const onScheme = () => {
      if (current.mode === "system") {
        applyAppearance(current, { restingShadow: framed })
      }
    }

    loadProfile().then(p => apply(p.appearance))
    loadDevice().then(d => setupI18n(d.language))

    const fade = (out: boolean) => {
      if (!framed) {
        fadeShell(out)
      }
    }

    fade(false)

    const stops = [
      onProfile(p => apply(p.appearance)),
      onDevice(d => setupI18n(d.language)),
      onWindowShown(windowLabel, () => fade(false)),
      onWindowHiding(windowLabel, () => fade(true)),
    ]

    scheme.addEventListener("change", onScheme)

    return () => {
      for (const stop of stops) {
        stop.then(unlisten => unlisten())
      }

      scheme.removeEventListener("change", onScheme)
    }
  })
</script>

<svelte:head><link rel="icon" type="image/svg+xml" href={favicon} /></svelte:head>

<div class="siri-shell">
  <Aura />

  {@render children()}
</div>

<GlobalContextMenu dense={page.data.denseMenu === true} />
